using System.Globalization;
using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using Google.Protobuf;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.VisualBasic.FileIO;
using NoPonto.Application.GPS;
using TransitRealtime;

namespace TerminalPresenceLab;

// Isolated laboratory module. No host, writer, operational adapter, cache, hub or database.
public sealed class TerminalPreflight : IDisposable
{
    public const int ItsPagesPerRound = 5, Rounds = 2, ItsGetLimit = 10, GtfsGetLimit = 4;
    public const int ItsPageBytes = 4 * 1024 * 1024, GtfsBodyBytes = 2 * 1024 * 1024;
    public const int TotalBytes = 48 * 1024 * 1024, TotalSeconds = 240;
    public static readonly Uri ItsUri = new("https://its.mobilidade.rio/v1/geolocalizacao/veiculos");
    public static readonly Uri GtfsUri = new("https://dados.mobilidade.rio/gtfs/realtime/onibus/vehicle-positions");
    public static object Plan => new { mode="offline_plan_no_requests", rounds=Rounds,
        its=new { acquisitions=2, closedUtcMinutesPerAcquisition=1, pagesPerAcquisition=5, limit=5000,
            maximumRecordsPerAcquisition=25000, maximumGets=10, pageBytes=ItsPageBytes, acquisitionSeconds=30 },
        gtfs=new { maximumGets=4, minimumStartSpacingSeconds=31, bodyBytes=GtfsBodyBytes },
        maximumGets=14, maximumBodyBytes=TotalBytes, maximumSeconds=TotalSeconds, requestSeconds=10,
        filters="ITS sistema=sppo, modo=onibus only; no service, vehicle, provider or terminal filter",
        privacy="individual observations only in memory; stdout aggregate only" };

    public sealed class Stop : Exception { public string Reason { get; } public Stop(string reason) : base(reason) { Reason=reason; } }
    public sealed record Point(double Lat, double Lon);
    public sealed record Polygon(Point[] Coordinates, string Origin, string Revision, DateTimeOffset ReviewedAt);
    public sealed record Facility(string Id, string[] StopIds, bool Primary=false, Polygon? TrustedPolygon=null)
    {
        [JsonIgnore] public Point[] Anchors { get; set; } = [];
    }
    public sealed record Observation(string OriginalId, string Id, string Provider, Point Position,
        DateTimeOffset PhysicalAt, DateTimeOffset? ServerAt, string? Service, string? Route,
        string? Trip, string? Direction, double? Speed)
    {
        public override string ToString() => "physical observation (memory only)";
    }
    public sealed class ItsRead
    {
        [JsonIgnore] public List<Observation> Rows { get; }=[];
        public Dictionary<string,int> Rejected { get; }=[];
        public bool Complete { get; set; }
        public string Reason { get; set; }="not_read";
        public DateTimeOffset Minute { get; set; }
        public int Pages { get; set; }
        public int RawRecords { get; set; }
    }
    public sealed record GtfsRecord(string Id, DateTimeOffset? PhysicalAt, Point? Position, string? Route);
    public sealed class Feed
    {
        [JsonIgnore] public Dictionary<string,List<GtfsRecord>> Global { get; }=new(StringComparer.Ordinal);
        public bool Complete { get; set; }
        public bool IdentityCoverage { get; set; }=true;
        public string Reason { get; set; }="not_read";
        public DateTimeOffset? GeneratedAt { get; set; }
        public DateTimeOffset ReceivedAt { get; set; }
        public int RawEntities { get; set; }
    }
    public sealed record Decision(string Relation, string Location, string FacilityId, string? LineSlice,
        double AgeSeconds, bool AbsenceComparable);
    public sealed record RoundSummary(int Index, string Status, int ItsPages, int ItsRawRecords,
        int ItsPhysicalRecords, Dictionary<string,int> ItsRejected, int GtfsBeforeRecords, int GtfsAfterRecords,
        Dictionary<string,int> Groups, Dictionary<string,int> Renewal);

    private readonly TimeProvider _clock;
    private readonly Func<TimeSpan,CancellationToken,Task> _delay;
    private readonly BudgetHandler _guard;
    private readonly HttpClient _http;
    private readonly GpsDatarioClient _its;
    private readonly long _began;
    private byte[]? _cached;
    private string? _etag;
    private DateTimeOffset? _modified;
    private Dictionary<string,Observation> _previous=[];
    private HashSet<string> _previousQualified=[];
    private readonly Dictionary<string,string> _routeCodes;
    private readonly Facility[] _facilities;
    public int ItsGets => _guard.ItsGets;
    public int GtfsGets => _guard.GtfsGets;
    public long BodyBytes => _guard.BodyBytes;

    public TerminalPreflight(HttpMessageHandler transport, TimeProvider clock,
        Func<TimeSpan,CancellationToken,Task> delay, Facility[] facilities, Dictionary<string,string> routeCodes)
    {
        _clock=clock; _delay=delay; _facilities=facilities; _routeCodes=routeCodes;
        _began=clock.GetTimestamp();
        ValidateFacilities(facilities);
        _guard=new BudgetHandler(transport,clock,delay);
        // The existing ITS client builds a relative URI; pin its base to the centralized API.
        _http=new HttpClient(_guard) { BaseAddress=new Uri("https://its.mobilidade.rio/"), Timeout=Timeout.InfiniteTimeSpan };
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("NoPonto-Terminal-Preflight/1.0");
        _its=new GpsDatarioClient(_http,NullLogger<GpsDatarioClient>.Instance);
    }
    public void Dispose() { _previous.Clear(); _previousQualified.Clear(); _cached=null; _http.Dispose(); }
    public static string Canonical(string value) => value.Trim().ToUpperInvariant();
    private static string? Text(string? value) => string.IsNullOrWhiteSpace(value)?null:value.Trim();
    private static readonly string[] TimeFormats=["yyyy-MM-dd'T'HH:mm:ss'Z'","yyyy-MM-dd'T'HH:mm:ss.FFFFFFF'Z'",
        "yyyy-MM-dd'T'HH:mm:sszzz","yyyy-MM-dd'T'HH:mm:ss.FFFFFFFzzz"];
    private static DateTimeOffset? Timestamp(string? value) => DateTimeOffset.TryParseExact(value,TimeFormats,
        CultureInfo.InvariantCulture,DateTimeStyles.AssumeUniversal|DateTimeStyles.AdjustToUniversal,out var t)?t:null;
    private static void Count(Dictionary<string,int> counts,string key) => counts[key]=counts.GetValueOrDefault(key)+1;
    private void CheckTime() { if(_clock.GetElapsedTime(_began).TotalSeconds>=TotalSeconds)throw new Stop("pilot_deadline"); }

    public Observation? Physical(GpsDatarioVehicleDto row, out string reason)
    {
        reason="accepted";
        if(!string.Equals(row.Sistema?.Trim(),"sppo",StringComparison.OrdinalIgnoreCase)
            || !string.Equals(row.Modo?.Trim(),"onibus",StringComparison.OrdinalIgnoreCase)) { reason="scope";return null; }
        var id=Text(row.IdVeiculo);
        if(id==null||id.Length>64||id.Any(char.IsControl)||Text(row.Fornecedor)==null) {reason="identity_or_provider";return null;}
        if(row.Latitude is not {} lat||row.Longitude is not {} lon||!GpsLeituraValidator.CoordenadaValida(lat,lon)) {reason="invalid_fix";return null;}
        var gps=Timestamp(row.Datetime);var now=_clock.GetUtcNow();
        if(gps==null||gps<=DateTimeOffset.UnixEpoch) {reason="invalid_physical_time";return null;}
        if(gps>now) {reason="future_physical_time";return null;}
        if((now-gps.Value).TotalSeconds>180) {reason="old_physical_time";return null;}
        // No service/trip/route requirement. Unknown speed remains unknown.
        return new(row.IdVeiculo!,Canonical(id),Canonical(row.Fornecedor!),new(lat,lon),gps.Value,
            Timestamp(row.DatetimeServidor),Text(row.Servico)?.ToUpperInvariant(),Text(row.RouteId),Text(row.TripId),
            Text(row.DirectionId),row.Velocidade is {} speed&&double.IsFinite(speed)&&speed>=0?speed:null);
    }

    public async Task<ItsRead> ReadItsAsync(DateTimeOffset minute,CancellationToken ct=default)
    {
        var result=new ItsRead { Minute=minute };
        var start=_clock.GetTimestamp();
        using var total=CancellationTokenSource.CreateLinkedTokenSource(ct); total.CancelAfter(TimeSpan.FromSeconds(30));
        var cursors=new HashSet<string>(StringComparer.Ordinal);string? cursor=null;
        try
        {
            if(minute.Offset!=TimeSpan.Zero||minute.Second!=0||minute.Millisecond!=0
                ||minute.AddMinutes(1)>_clock.GetUtcNow())throw new Stop("minute_not_closed");
            do
            {
                CheckTime();
                if(_clock.GetElapsedTime(start).TotalSeconds>=30)throw new Stop("its_acquisition_deadline");
                using var pageBudget=CancellationTokenSource.CreateLinkedTokenSource(total.Token);pageBudget.CancelAfter(TimeSpan.FromSeconds(10));
                var page=await _its.BuscarPaginaLimitadaAsync(new(minute,"sppo","onibus",Limit:5000),cursor,
                    ItsPageBytes,pageBudget.Token,_clock);
                result.Pages++;
                CheckTime();
                if(_clock.GetElapsedTime(start).TotalSeconds>=30)throw new Stop("its_acquisition_deadline");
                if(Timestamp(page.MinutoUtc)!=minute||page.Data==null)throw new Stop("its_minute_or_body_invalid");
                var states=page.ProvidersStatus?.GroupBy(x=>Canonical(x.Key)).ToDictionary(g=>g.Key,g=>g.ToArray());
                if(states==null||new[]{"ZIRIX","CONECTA"}.Any(p=>!states.TryGetValue(p,out var s)||s.Length!=1||s[0].Value?.Trim().ToLowerInvariant()!="ok"))
                    throw new Stop("its_providers_incomplete");
                if(page.Data.Count>5000)throw new Stop("its_page_record_limit");
                result.RawRecords+=page.Data.Count;
                foreach(var raw in page.Data)
                {
                    if(raw==null) {Count(result.Rejected,"invalid_row");continue;}
                    var observation=Physical(raw,out var reason);
                    if(observation==null)Count(result.Rejected,reason);else result.Rows.Add(observation);
                }
                cursor=Text(page.NextCursor);
                if(cursor!=null&&(cursor.Length>48||!cursors.Add(cursor)))throw new Stop("its_cursor_invalid");
                if(cursor!=null&&result.Pages>=ItsPagesPerRound)throw new Stop("its_pagination_incomplete");
            }while(cursor!=null);
            result.Complete=true; result.Reason="complete";
        }
        catch(Stop e) {result.Reason=e.Reason;}
        catch(OperationCanceledException) when(!ct.IsCancellationRequested) {result.Reason="its_timeout";}
        catch(Exception e) when(e is JsonException or InvalidDataException or HttpRequestException or IOException)
        {result.Reason="its_acquisition_failed";}
        return result;
    }

    public async Task<Feed> ReadGtfsAsync(CancellationToken ct=default)
    {
        var result=new Feed();
        try
        {
            CheckTime();
            // Respect cadence and cache before starting the ten-second network/body timer.
            await _guard.WaitForGtfsSlotAsync(ct);
            CheckTime();
            using var budget=CancellationTokenSource.CreateLinkedTokenSource(ct);budget.CancelAfter(TimeSpan.FromSeconds(10));
            using var request=new HttpRequestMessage(HttpMethod.Get,GtfsUri);
            if(_etag!=null)request.Headers.TryAddWithoutValidation("If-None-Match",_etag);
            if(_modified.HasValue)request.Headers.IfModifiedSince=_modified;
            using var response=await _http.SendAsync(request,HttpCompletionOption.ResponseHeadersRead,budget.Token);
            byte[] body;
            if(response.StatusCode==HttpStatusCode.NotModified)
            {
                var identified=response.Headers.ETag is {} tag?tag.ToString()==_etag
                    :response.Content.Headers.LastModified is {} modified&&modified==_modified;
                if(_cached==null||!identified)throw new Stop("gtfs_304_not_identified");
                body=_cached;
            }
            else
            {
                if(!response.IsSuccessStatusCode)throw new Stop("gtfs_http_failure");
                body=await response.Content.ReadAsByteArrayAsync(budget.Token);
            }
            CheckTime();
            var now=_clock.GetUtcNow();result=DecodeGtfs(body,now);
            if(response.Headers.CacheControl?.NoStore==true) {_cached=null;_etag=null;_modified=null;}
            else
            {
                _cached=body;
                // A new 200 representation supersedes validators from any previous body.
                if(response.StatusCode==HttpStatusCode.NotModified)
                { _etag=response.Headers.ETag?.ToString()??_etag;_modified=response.Content.Headers.LastModified??_modified; }
                else { _etag=response.Headers.ETag?.ToString();_modified=response.Content.Headers.LastModified; }
            }
        }
        catch(Stop e) {result.Reason=e.Reason;}
        catch(OperationCanceledException) when(!ct.IsCancellationRequested) {result.Reason="gtfs_timeout";}
        catch(Exception e) when(e is InvalidProtocolBufferException or HttpRequestException or IOException or InvalidDataException)
        {result.Reason="gtfs_acquisition_failed";}
        return result;
    }
    public static Feed DecodeGtfs(byte[] body,DateTimeOffset received)
    {
        var result=new Feed {ReceivedAt=received};
        var feed=FeedMessage.Parser.ParseFrom(body);var h=feed.Header;
        if(h==null||h.GtfsRealtimeVersion!="2.0"||h.Incrementality!=FeedHeader.Types.Incrementality.FullDataset
            ||!h.HasTimestamp||h.Timestamp==0||h.Timestamp>253402300799UL||feed.Entity.Count>5000)throw new Stop("gtfs_header_invalid");
        result.GeneratedAt=DateTimeOffset.FromUnixTimeSeconds((long)h.Timestamp);
        var entityIds=new HashSet<string>(StringComparer.Ordinal);
        foreach(var entity in feed.Entity)
        {
            if(!entity.HasId||string.IsNullOrWhiteSpace(entity.Id)||!entityIds.Add(entity.Id)||entity.IsDeleted)throw new Stop("gtfs_entity_invalid");
            result.RawEntities++;
            var v=entity.Vehicle;
            if(v==null)continue;
            if(v.Vehicle==null||!v.Vehicle.HasId||string.IsNullOrWhiteSpace(v.Vehicle.Id)) {result.IdentityCoverage=false;continue;}
            var id=Canonical(v.Vehicle.Id);
            if(id.Length>64||id.Any(char.IsControl)) {result.IdentityCoverage=false;continue;}
            var gps=v.HasTimestamp&&v.Timestamp is >0 and <=253402300799UL?DateTimeOffset.FromUnixTimeSeconds((long)v.Timestamp):(DateTimeOffset?)null;
            var p=v.Position;Point? position=p!=null&&p.HasLatitude&&p.HasLongitude&&GpsLeituraValidator.CoordenadaValida(p.Latitude,p.Longitude)?new(p.Latitude,p.Longitude):null;
            if(!result.Global.TryGetValue(id,out var readings))result.Global[id]=readings=[];
            readings.Add(new(id,gps,position,Text(v.Trip?.RouteId)));
        }
        result.Complete=true;result.Reason="complete";return result;
    }

    public Decision Compare(Observation row,ItsRead its,Feed before,Feed after,Facility facility)
    {
        var now=_clock.GetUtcNow();var age=(now-row.PhysicalAt).TotalSeconds;
        var location=Locate(row.Position,facility);
        var line=row.Service is "838" or "884" or "866" or "SV866"?row.Service:null;
        var present=before.Global.GetValueOrDefault(row.Id,[]).Concat(after.Global.GetValueOrDefault(row.Id,[])).ToArray();
        if(present.Length>0)
        {
            if(present.Any(x=>x.PhysicalAt==row.PhysicalAt&&x.Position!=null&&
                (Math.Abs(x.Position.Lat-row.Position.Lat)>.00001||Math.Abs(x.Position.Lon-row.Position.Lon)>.00001)))
                return new("same_gps_coordinate_conflict",location,facility.Id,line,age,false);
            var other=row.Service!=null&&present.Any(x=>x.Route!=null&&_routeCodes.TryGetValue(x.Route,out var code)&&code!=row.Service);
            return new(other?"present_other_gtfs_line":"present_global_gtfs",location,facility.Id,line,age,false);
        }
        var aligned=its.Complete&&before.Complete&&after.Complete&&before.IdentityCoverage&&after.IdentityCoverage
            &&(row.Provider is "ZIRIX" or "CONECTA")&&age is >=0 and <=60
            &&row.ServerAt>=its.Minute&&row.ServerAt<its.Minute.AddMinutes(1)
            &&before.GeneratedAt!=null&&after.GeneratedAt>before.GeneratedAt
            &&new[]{before.GeneratedAt!.Value,after.GeneratedAt!.Value}.All(t=>t<=now&&(now-t).TotalSeconds<=90
                &&Math.Abs((t-row.PhysicalAt).TotalSeconds)<=60);
        return new(aligned?"not_observed_in_aligned_gtfs":"inconclusive_absence",location,facility.Id,line,age,aligned);
    }

    public RoundSummary Summarize(int index,ItsRead its,Feed before,Feed after)
    {
        var groups=new Dictionary<string,int>();var renewal=new Dictionary<string,int>();var current=new Dictionary<string,Observation>();
        var qualified=new HashSet<string>();
        foreach(var group in its.Rows.GroupBy(x=>x.Id,StringComparer.Ordinal))
        {
            var newest=group.Max(x=>x.PhysicalAt);var candidates=group.Where(x=>x.PhysicalAt==newest).ToArray();
            if(candidates.Any(x=>x.Service!=candidates[0].Service||Distance(x.Position,candidates[0].Position)>2))
            {Count(groups,"identity_ambiguous");continue;}
            foreach(var row in candidates.DistinctBy(x=>x.Provider))
            {
                var key=row.Provider+"|"+row.Id;current[key]=row;
                foreach(var facility in _facilities)
                {
                    var decision=Compare(row,its,before,after,facility);
                    if(decision.Location=="outside")continue;
                    Count(groups,facility.Id+"/"+decision.Location+"/"+decision.Relation+"/"+(decision.LineSlice??(row.Service==null?"service_missing":"other_service")));
                    if(row.Trip==null)Count(groups,facility.Id+"/trip_missing");
                    if(row.Route==null)Count(groups,facility.Id+"/route_missing");
                    if(decision.AbsenceComparable&&decision.Location=="inside_trusted")qualified.Add(key+"|"+facility.Id);
                }
                if(_previous.TryGetValue(key,out var old))
                {
                    var progress=row.PhysicalAt.CompareTo(old.PhysicalAt);var displacement=Distance(row.Position,old.Position);
                    Count(renewal,progress>0?"physical_advanced":progress<0?"physical_regressed":displacement>2?"equal_gps_conflict":"physical_repeated");
                    if(progress>0&&displacement<=10)
                    {
                        Count(renewal,"stationary_with_new_physical_gps");
                        if(qualified.Any(k=>k.StartsWith(key+"|",StringComparison.Ordinal)&&_previousQualified.Contains(k)))
                            Count(renewal,"renewed_inside_trusted_not_observed_gtfs");
                    }
                }
            }
        }
        // Partial rounds never become a renewal baseline or an absence witness.
        if(its.Complete){_previous=current;_previousQualified=qualified;}else {_previous.Clear();_previousQualified.Clear();}
        return new(index,its.Complete&&before.Complete&&after.Complete?"complete_reads_check_alignment":"inconclusive",
            its.Pages,its.RawRecords,its.Rows.Count,its.Rejected,before.RawEntities,after.RawEntities,groups,renewal);
    }

    public async Task<object> RunAsync(CancellationToken ct=default)
    {
        var summaries=new List<RoundSummary>();var status="completed_preflight";
        using var deadline=CancellationTokenSource.CreateLinkedTokenSource(ct);deadline.CancelAfter(TimeSpan.FromSeconds(TotalSeconds));
        try
        {
            // Near the beginning of a minute, the last closed minute is less stale.
            var now=_clock.GetUtcNow();var target=new DateTimeOffset(now.Year,now.Month,now.Day,now.Hour,now.Minute,0,TimeSpan.Zero).AddMinutes(1).AddSeconds(5);
            await _delay(target-now,deadline.Token);
            long? previousIts=null;
            for(var i=0;i<Rounds;i++)
            {
                if(previousIts is {} previous)
                {
                    var remaining=TimeSpan.FromSeconds(60)-_clock.GetElapsedTime(previous);
                    if(remaining>TimeSpan.Zero)await _delay(remaining,deadline.Token);
                }
                CheckTime();var before=await ReadGtfsAsync(deadline.Token);
                if(!before.Complete){status=before.Reason;break;}
                var t=_clock.GetUtcNow();var minute=new DateTimeOffset(t.Year,t.Month,t.Day,t.Hour,t.Minute,0,TimeSpan.Zero).AddMinutes(-1);
                previousIts=_clock.GetTimestamp();var its=await ReadItsAsync(minute,deadline.Token);
                if(!its.Complete)
                {
                    summaries.Add(Summarize(i,its,before,new Feed()));status=its.Reason;break;
                }
                var after=await ReadGtfsAsync(deadline.Token);
                summaries.Add(Summarize(i,its,before,after));
                if(!after.Complete){status=after.Reason;break;}
            }
        }
        catch(OperationCanceledException){status="pilot_cancelled_or_deadline";}
        catch(Stop e){status=e.Reason;}
        return new {status,itsGets=ItsGets,gtfsGets=GtfsGets,bodyBytes=BodyBytes,
            elapsedSeconds=_clock.GetElapsedTime(_began).TotalSeconds,
            trustedGeometryAvailable=_facilities.Any(x=>x.TrustedPolygon!=null),rounds=summaries,
            conclusion="aggregated observations only; no claim of boarding availability or network-wide coverage"};
    }

    public static double Distance(Point a,Point b)
    {
        var r=Math.PI/180;var h=Math.Pow(Math.Sin((b.Lat-a.Lat)*r/2),2)+Math.Cos(a.Lat*r)*Math.Cos(b.Lat*r)*Math.Pow(Math.Sin((b.Lon-a.Lon)*r/2),2);
        return 6371000*2*Math.Asin(Math.Sqrt(Math.Min(1,h)));
    }
    private static double SegmentDistance(Point p,Point a,Point b)
    {
        var c=Math.Cos(p.Lat*Math.PI/180);var ax=(a.Lon-p.Lon)*c;var ay=a.Lat-p.Lat;
        var dx=(b.Lon-a.Lon)*c;var dy=b.Lat-a.Lat;var norm=dx*dx+dy*dy;
        var t=norm==0?0:Math.Clamp(-(ax*dx+ay*dy)/norm,0,1);
        return Math.Sqrt(Math.Pow(ax+t*dx,2)+Math.Pow(ay+t*dy,2))*Math.PI/180*6371000;
    }
    public static string Locate(Point p,Facility f)
    {
        if(f.TrustedPolygon is {} polygon)
        {
            var coordinates=polygon.Coordinates;var inside=false;
            for(int i=0,j=coordinates.Length-1;i<coordinates.Length;j=i++)
            {
                var a=coordinates[i];var b=coordinates[j];
                if((a.Lat>p.Lat)!=(b.Lat>p.Lat)&&p.Lon<(b.Lon-a.Lon)*(p.Lat-a.Lat)/(b.Lat-a.Lat)+a.Lon)inside=!inside;
            }
            var boundary=coordinates.Zip(coordinates.Skip(1),(a,b)=>SegmentDistance(p,a,b)).Min();
            if(boundary<=20)return "uncertain_location";
            if(inside)return "inside_trusted";
        }
        var distance=f.Anchors.Select(a=>Distance(p,a)).DefaultIfEmpty(double.PositiveInfinity).Min();
        return distance<=200?"near_terminal":distance<=1000?"uncertain_location":"outside";
    }
    public static void ValidateFacilities(Facility[] facilities)
    {
        if(facilities.Length==0||facilities.Length>10||facilities.Select(x=>x.Id).Distinct().Count()!=facilities.Length)throw new Stop("facility_catalog_invalid");
        foreach(var f in facilities)
        {
            if(string.IsNullOrWhiteSpace(f.Id)||f.Id.Length>64||f.Id.Any(c=>!char.IsAsciiLetterOrDigit(c)&&c!='-'))throw new Stop("facility_id_invalid");
            if(f.Anchors.Length==0||f.Anchors.Any(p=>!GpsLeituraValidator.CoordenadaValida(p.Lat,p.Lon)))throw new Stop("facility_anchors_invalid");
            if(f.TrustedPolygon is not {} polygon)continue;
            var points=polygon.Coordinates;
            if(string.IsNullOrWhiteSpace(polygon.Origin)||string.IsNullOrWhiteSpace(polygon.Revision)||polygon.ReviewedAt==default
                ||points.Length<4||points.Length>1000||points[0]!=points[^1]||points.Any(p=>!GpsLeituraValidator.CoordenadaValida(p.Lat,p.Lon)))
                throw new Stop("trusted_geometry_invalid");
            // Require nonzero area; a reviewed polygon is data, never inferred from a name.
            var area=points.Zip(points.Skip(1),(a,b)=>a.Lon*b.Lat-b.Lon*a.Lat).Sum();
            if(Math.Abs(area)<1e-12)throw new Stop("trusted_geometry_degenerate");
            // A self-crossing boundary cannot establish an unambiguous interior.
            for(var a=0;a<points.Length-1;a++)
                for(var b=a+2;b<points.Length-1;b++)
                    if(!(a==0&&b==points.Length-2)&&Crosses(points[a],points[a+1],points[b],points[b+1]))
                        throw new Stop("trusted_geometry_self_intersecting");
        }
    }

    private static bool Crosses(Point a,Point b,Point c,Point d)
    {
        static double Turn(Point x,Point y,Point z)=>(y.Lon-x.Lon)*(z.Lat-x.Lat)-(y.Lat-x.Lat)*(z.Lon-x.Lon);
        static bool Between(double x,double a,double b)=>x>=Math.Min(a,b)&&x<=Math.Max(a,b);
        static bool On(Point x,Point y,Point z)=>Math.Abs(Turn(x,y,z))<1e-12&&Between(z.Lat,x.Lat,y.Lat)&&Between(z.Lon,x.Lon,y.Lon);
        var t1=Turn(a,b,c);var t2=Turn(a,b,d);var t3=Turn(c,d,a);var t4=Turn(c,d,b);
        return (t1*t2<0&&t3*t4<0)||On(a,b,c)||On(a,b,d)||On(c,d,a)||On(c,d,b);
    }

    public static (Facility[] Facilities,Dictionary<string,string> RouteCodes) LoadCatalog(string zipPath,string catalogPath)
    {
        var facilities=JsonSerializer.Deserialize<Facility[]>(File.ReadAllText(catalogPath),new JsonSerializerOptions {PropertyNameCaseInsensitive=true})??[];
        using var archive=ZipFile.OpenRead(zipPath);
        List<Dictionary<string,string>> Csv(string name)
        {
            using var stream=archive.GetEntry(name)?.Open()??throw new Stop("static_file_missing");
            using var csv=new TextFieldParser(stream){HasFieldsEnclosedInQuotes=true};csv.SetDelimiters(",");
            var headers=csv.ReadFields()!;var rows=new List<Dictionary<string,string>>();
            while(!csv.EndOfData){var fields=csv.ReadFields()!;rows.Add(headers.Select((key,i)=>(key,value:fields[i])).ToDictionary(x=>x.key,x=>x.value));}
            return rows;
        }
        var stops=Csv("stops.txt");
        foreach(var f in facilities)
        {
            if(f.StopIds.Any(id=>!stops.Any(x=>x["stop_id"]==id)))throw new Stop("facility_stop_not_in_schedule");
            var selected=stops.Where(s=>f.StopIds.Contains(s["stop_id"])||f.StopIds.Contains(s.GetValueOrDefault("parent_station",""))).ToArray();
            f.Anchors=selected.Select(s=>new Point(double.Parse(s["stop_lat"],CultureInfo.InvariantCulture),double.Parse(s["stop_lon"],CultureInfo.InvariantCulture))).ToArray();
        }
        ValidateFacilities(facilities);
        return(facilities,Csv("routes.txt").ToDictionary(x=>x["route_id"],x=>x["route_short_name"]));
    }

    private sealed class BudgetHandler(HttpMessageHandler inner,TimeProvider clock,Func<TimeSpan,CancellationToken,Task> delay) : DelegatingHandler(inner)
    {
        public int ItsGets {get;private set;} public int GtfsGets {get;private set;} public long BodyBytes;
        private readonly long _start=clock.GetTimestamp();
        private long? _lastIts,_lastGtfs;
        private DateTimeOffset _gtfsFreshUntil;
        private TimeSpan? _storedMaxAge;
        private bool _storedNoCache;
        public Task WaitForGtfsSlotAsync(CancellationToken ct)=>WaitForSlotAsync(false,ct);
        private async Task WaitForSlotAsync(bool isIts,CancellationToken ct)
        {
            var last=isIts?_lastIts:_lastGtfs;var minimum=isIts?1:31;
            while(true)
            {
                var wait=last.HasValue?TimeSpan.FromSeconds(minimum)-clock.GetElapsedTime(last.Value):TimeSpan.Zero;
                if(!isIts&&_gtfsFreshUntil-clock.GetUtcNow()>wait)wait=_gtfsFreshUntil-clock.GetUtcNow();
                if(clock.GetElapsedTime(_start)+TimeSpan.FromTicks(Math.Max(0,wait.Ticks))>=TimeSpan.FromSeconds(TotalSeconds))throw new Stop("pilot_deadline");
                if(wait<=TimeSpan.Zero)break;
                await delay(wait,ct);
            }
        }
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken ct)
        {
            var isIts=request.RequestUri?.GetLeftPart(UriPartial.Path)==ItsUri.ToString();
            var isGtfs=request.RequestUri==GtfsUri;
            if(request.Method!=HttpMethod.Get||(!isIts&&!isGtfs))throw new Stop("endpoint_not_allowed");
            await WaitForSlotAsync(isIts,ct);
            var minimum=isIts?1:31;
            if(isIts){if(ItsGets>=ItsGetLimit)throw new Stop("its_get_budget");ItsGets++;_lastIts=clock.GetTimestamp();}
            else {if(GtfsGets>=GtfsGetLimit)throw new Stop("gtfs_get_budget");GtfsGets++;_lastGtfs=clock.GetTimestamp();}
            var began=clock.GetUtcNow();var response=await base.SendAsync(request,ct);var received=clock.GetUtcNow();
            try
            {
                if(clock.GetElapsedTime(_start).TotalSeconds>=TotalSeconds)throw new Stop("pilot_deadline");
                if(response.StatusCode is HttpStatusCode.TooManyRequests or HttpStatusCode.ServiceUnavailable)throw new Stop("provider_429_or_503");
                if(!response.IsSuccessStatusCode&&response.StatusCode!=HttpStatusCode.NotModified)throw new Stop("provider_http_failure");
                if(response.Headers.RetryAfter!=null)throw new Stop("provider_retry_after_stop");
                foreach(var key in new[]{"RateLimit-Remaining","X-RateLimit-Remaining"})
                    if(response.Headers.TryGetValues(key,out var values)&&values.Any(v=>!double.TryParse(v,CultureInfo.InvariantCulture,out var n)||!double.IsFinite(n)||n<=0))throw new Stop("provider_rate_limit_stop");
                if(response.Headers.Contains("RateLimit-Policy")||response.Headers.Contains("RateLimit"))throw new Stop("provider_policy_requires_review");
                foreach(var key in new[]{"X-Poll-Interval","X-Min-Poll-Interval"})
                    if(response.Headers.TryGetValues(key,out var values)&&values.Any(v=>!double.TryParse(v,CultureInfo.InvariantCulture,out var n)||!double.IsFinite(n)||n<0||n>minimum))throw new Stop("provider_interval_requires_review");
                if(isGtfs)
                {
                    var cc=response.Headers.CacheControl;var notModified=response.StatusCode==HttpStatusCode.NotModified;
                    _storedMaxAge=cc?.MaxAge??(notModified&&cc==null?_storedMaxAge:null);
                    _storedNoCache=cc?.NoCache??(notModified&&_storedNoCache);
                    var apparent=response.Headers.Date is {} date?Math.Max(0,(received-date).TotalSeconds):0;
                    var corrected=Math.Max(apparent,(response.Headers.Age?.TotalSeconds??0)+Math.Max(0,(received-began).TotalSeconds));
                    _gtfsFreshUntil=received.AddSeconds(_storedNoCache||cc?.NoStore==true?0:Math.Max(0,(_storedMaxAge?.TotalSeconds??0)-corrected));
                }
                var limit=isIts?ItsPageBytes:GtfsBodyBytes;
                if(response.Content.Headers.ContentLength>limit)throw new Stop("response_byte_limit");
                response.Content=new LimitedContent(response.Content,this,limit);
                return response;
            }
            catch {response.Dispose();throw;}
        }
        private sealed class LimitedContent : HttpContent
        {
            private readonly HttpContent _original;private readonly BudgetHandler _owner;private readonly int _limit;
            public LimitedContent(HttpContent original,BudgetHandler owner,int limit)
            {_original=original;_owner=owner;_limit=limit;foreach(var header in original.Headers)Headers.TryAddWithoutValidation(header.Key,header.Value);}
            protected override bool TryComputeLength(out long length){length=_original.Headers.ContentLength??0;return _original.Headers.ContentLength.HasValue;}
            protected override async Task<Stream> CreateContentReadStreamAsync()=>new LimitedStream(await _original.ReadAsStreamAsync(),_owner,_limit,_original.Headers.ContentLength);
            protected override async Task<Stream> CreateContentReadStreamAsync(CancellationToken ct)=>new LimitedStream(await _original.ReadAsStreamAsync(ct),_owner,_limit,_original.Headers.ContentLength);
            protected override Task SerializeToStreamAsync(Stream stream,TransportContext? context)=>SerializeToStreamAsync(stream,context,CancellationToken.None);
            protected override async Task SerializeToStreamAsync(Stream stream,TransportContext? context,CancellationToken ct)
            {using var input=await CreateContentReadStreamAsync(ct);await input.CopyToAsync(stream,ct);}
            protected override void Dispose(bool disposing){if(disposing)_original.Dispose();base.Dispose(disposing);}
        }
        private sealed class LimitedStream(Stream source,BudgetHandler owner,int limit,long? knownLength) : Stream
        {
            private long _read;
            private int Allowed(int wanted)
            {
                if(knownLength==_read)return 0;
                var remaining=Math.Min(limit-_read,TotalBytes-owner.BodyBytes);
                if(remaining<=0)throw new Stop("body_byte_budget");
                return (int)Math.Min(wanted,remaining);
            }
            public override async ValueTask<int> ReadAsync(Memory<byte> buffer,CancellationToken ct=default)
            {var count=Allowed(buffer.Length);if(count==0)return 0;var n=await source.ReadAsync(buffer[..count],ct);_read+=n;owner.BodyBytes+=n;return n;}
            public override Task<int> ReadAsync(byte[] buffer,int offset,int count,CancellationToken ct)=>ReadAsync(buffer.AsMemory(offset,count),ct).AsTask();
            public override int Read(byte[] buffer,int offset,int count){count=Allowed(count);if(count==0)return 0;var n=source.Read(buffer,offset,count);_read+=n;owner.BodyBytes+=n;return n;}
            protected override void Dispose(bool disposing){if(disposing)source.Dispose();base.Dispose(disposing);}
            public override bool CanRead=>true;public override bool CanSeek=>false;public override bool CanWrite=>false;
            public override long Length=>throw new NotSupportedException();public override long Position{get=>throw new NotSupportedException();set=>throw new NotSupportedException();}
            public override void Flush()=>throw new NotSupportedException();public override long Seek(long offset,SeekOrigin origin)=>throw new NotSupportedException();
            public override void SetLength(long value)=>throw new NotSupportedException();public override void Write(byte[] buffer,int offset,int count)=>throw new NotSupportedException();
        }
    }
}

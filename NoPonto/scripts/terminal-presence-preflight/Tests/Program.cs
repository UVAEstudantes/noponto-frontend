using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Google.Protobuf;
using NoPonto.Application.GPS;
using TerminalPresenceLab;
using TransitRealtime;

// Deterministic, package-free executable tests. The only transport is QueueHandler.
static class Program
{
static async Task<int> Main()
{
var tests = new (string Name, Func<Task> Run)[]
{
    ("budget_counts_all_gets_and_stops_after_fourteen", BudgetCounts),
    ("four_minute_deadline_and_48_mib_body_budget", TimeAndBytes),
    ("fifth_its_page_with_cursor_is_inconclusive", IncompletePagination),
    ("missing_trip_route_service_keeps_original_physical_fix", MissingTripAndPhysicalIdentity),
    ("global_identity_finds_other_gtfs_line", GlobalIdentity),
    ("incompatible_time_or_incomplete_identity_never_proves_absence", UnalignedCannotProveAbsence),
    ("http_304_retains_generation_and_http_errors_stop", CacheAndErrors),
    ("duplicates_regression_and_conflicts_do_not_fake_gps_renewal", DuplicateAndRenewal),
    ("unreviewed_stops_only_prove_proximity", FacilityGeometry),
    ("temporal_gate_reasons_preserve_absence_rules", TemporalGateReasons),
    ("age_bands_separate_acquisition_from_comparison", AgeBands),
    ("cross_round_correlation_requires_same_source_physical_time_and_place", CrossRoundCorrelation),
    ("source_conflicts_and_ambiguous_identities_are_counted_locally", LocalConflicts),
    ("simulated_provider_and_server_minute_counts_explain_volume_shape", ProviderAndMinuteCounts),
    ("serialized_results_contain_no_individual_fix_or_secret", Privacy)
};
var failed=0;
foreach(var (name,run) in tests)
{
    try { await run(); Console.WriteLine("PASS "+name); }
    catch(Exception e) { failed++;Console.Error.WriteLine("FAIL "+name+" "+e.GetType().Name); }
}
Console.WriteLine($"{tests.Length-failed}/{tests.Length} passed");
return failed==0?0:1;
}

static void True(bool condition,string message="assertion failed")
{ if(!condition)throw new Exception(message); }
static void Equal<T>(T expected,T actual)
{if(!EqualityComparer<T>.Default.Equals(expected,actual))throw new Exception($"expected {expected}, actual {actual}");}

static readonly DateTimeOffset Start=new(2026,10,28,12,1,5,TimeSpan.Zero);
static TerminalPreflight.Point Anchor=>new(-22.9000,-43.5500);
static TerminalPreflight.Facility Facility(bool polygon=false)
{
    TerminalPreflight.Point[] square=[new(-22.902,-43.552),new(-22.902,-43.548),
        new(-22.898,-43.548),new(-22.898,-43.552),new(-22.902,-43.552)];
    return new("fixture-terminal",["fixture-stop"],true,polygon?
        new(square,"surveyed_perimeter","fixture-revision",Start):null) { Anchors=[Anchor] };
}
static TerminalPreflight Make(FakeClock clock,QueueHandler handler,TerminalPreflight.Facility? facility=null)
    =>new(handler,clock,(span,ct)=>{ct.ThrowIfCancellationRequested();clock.Advance(span);return Task.CompletedTask;},
        [facility??Facility()],new(){{"route_other","999"},{"route_838","838"}});
static GpsDatarioVehicleDto Vehicle(DateTimeOffset physical,string id="TEST-0001",string? service="838",string? route=null,string? trip=null,
    DateTimeOffset? server=null,double lat=-22.9,double lon=-43.55)
    =>new(){IdVeiculo=id,Fornecedor="ZIRIX",Sistema="sppo",Modo="onibus",Servico=service,RouteId=route,TripId=trip,
        Latitude=lat,Longitude=lon,Datetime=physical.ToString("O"),DatetimeServidor=(server??physical).ToString("O")};
static string Page(DateTimeOffset minute,object?[]? rows=null,string? cursor=null,int padding=0)
{
    var json=JsonSerializer.Serialize(new {minuto_utc=minute.ToString("O"),data=rows??[],
        next_cursor=cursor,providers_status=new {ZIRIX="ok",CONECTA="ok"}});
    if(padding>0)json=json.PadRight(padding,' ');
    return json;
}
static HttpResponseMessage TextResponse(string body,HttpStatusCode status=HttpStatusCode.OK)
    =>new(status){Content=new StringContent(body,Encoding.UTF8,"application/json")};
static HttpResponseMessage BinaryResponse(byte[] body,HttpStatusCode status=HttpStatusCode.OK)
    =>new(status){Content=new ByteArrayContent(body)};
static byte[] Gtfs(DateTimeOffset generated,string? vehicle=null,string? route=null,int targetBytes=0)
{
    var feed=new FeedMessage {Header=new FeedHeader {GtfsRealtimeVersion="2.0",
        Incrementality=FeedHeader.Types.Incrementality.FullDataset,Timestamp=(ulong)generated.ToUnixTimeSeconds()}};
    var entity=new FeedEntity {Id="fixture-entity"};
    if(vehicle!=null)entity.Vehicle=new VehiclePosition {Vehicle=new VehicleDescriptor {Id=vehicle},
        Trip=route==null?null:new TripDescriptor {RouteId=route},Timestamp=(ulong)generated.ToUnixTimeSeconds(),
        Position=new Position {Latitude=-22.9f,Longitude=-43.55f}};
    feed.Entity.Add(entity);
    if(targetBytes>0)
    {
        var missing=targetBytes-feed.CalculateSize();
        True(missing>0);
        // The filler is only a FeedEntity ID; no vehicle ID or location is created.
        entity.Id=new string('x',entity.Id.Length+missing);
        while(feed.CalculateSize()!=targetBytes)
            entity.Id=new string('x',entity.Id.Length+targetBytes-feed.CalculateSize());
    }
    return feed.ToByteArray();
}
static TerminalPreflight.Feed FeedAt(DateTimeOffset time,bool complete=true,bool coverage=true,string? id=null,string? route=null)
{
    var feed=new TerminalPreflight.Feed {Complete=complete,IdentityCoverage=coverage,GeneratedAt=time,ReceivedAt=time};
    if(id!=null)feed.Global[id]=[new(id,time,Anchor,route)];
    return feed;
}
static TerminalPreflight.ItsRead Its(DateTimeOffset minute,params TerminalPreflight.Observation[] rows)
{
    var result=new TerminalPreflight.ItsRead {Complete=true,Minute=minute,Reason="complete"};
    result.Rows.AddRange(rows);return result;
}

static async Task BudgetCounts()
{
    var clock=new FakeClock(Start);var minute=Start.AddMinutes(-1).AddSeconds(-5);
    var handler=new QueueHandler((request,_)=>
    {
        True(request.Method==HttpMethod.Get);
        if(request.RequestUri==TerminalPreflight.GtfsUri)return BinaryResponse(Gtfs(clock.GetUtcNow()));
        True(request.RequestUri?.GetLeftPart(UriPartial.Path)==TerminalPreflight.ItsUri.ToString());
        var query=request.RequestUri!.Query;
        True(query.Contains("sistema=sppo")&&query.Contains("modo=onibus")&&query.Contains("limit=5000"));
        True(!query.Contains("servico=")&&!query.Contains("id_veiculo=")&&!query.Contains("fornecedor="));
        return TextResponse(Page(minute));
    });
    using var probe=Make(clock,handler);
    for(var i=0;i<10;i++)True((await probe.ReadItsAsync(minute)).Complete);
    for(var i=0;i<4;i++)True((await probe.ReadGtfsAsync()).Complete);
    Equal(10,probe.ItsGets);Equal(4,probe.GtfsGets);Equal(14,handler.Requests);
    Equal("its_get_budget",(await probe.ReadItsAsync(minute)).Reason);
    Equal("gtfs_get_budget",(await probe.ReadGtfsAsync()).Reason);
    Equal(14,handler.Requests);
}

static async Task TimeAndBytes()
{
    var clock=new FakeClock(Start);var minute=Start.AddMinutes(-1).AddSeconds(-5);
    var its=Page(minute,padding:TerminalPreflight.ItsPageBytes);
    var gtfs=Gtfs(Start,targetBytes:TerminalPreflight.GtfsBodyBytes);
    Equal(TerminalPreflight.ItsPageBytes,Encoding.UTF8.GetByteCount(its));
    Equal(TerminalPreflight.GtfsBodyBytes,gtfs.Length);
    var handler=new QueueHandler((request,_)=>request.RequestUri==TerminalPreflight.GtfsUri?
        BinaryResponse(gtfs):TextResponse(its));
    using(var probe=Make(clock,handler))
    {
        for(var i=0;i<10;i++)True((await probe.ReadItsAsync(minute)).Complete);
        for(var i=0;i<4;i++)True((await probe.ReadGtfsAsync()).Complete);
        // StringContent adds no bytes to the UTF-8 fixture and all 14 bodies are read.
        Equal((long)TerminalPreflight.TotalBytes,probe.BodyBytes);
    }
    clock=new FakeClock(Start);var deadlineHandler=new QueueHandler((request,_)=>
    {clock.Advance(TimeSpan.FromSeconds(TerminalPreflight.TotalSeconds));return BinaryResponse(Gtfs(Start));});
    using var deadlineProbe=Make(clock,deadlineHandler);
    Equal("pilot_deadline",(await deadlineProbe.ReadGtfsAsync()).Reason);
    Equal(1,deadlineHandler.Requests);
    var over=new QueueHandler((request,_)=>BinaryResponse(new byte[TerminalPreflight.GtfsBodyBytes+1]));
    using var overProbe=Make(new FakeClock(Start),over);
    Equal("response_byte_limit",(await overProbe.ReadGtfsAsync()).Reason);
    Equal(0L,overProbe.BodyBytes);
}

static async Task IncompletePagination()
{
    var clock=new FakeClock(Start);var minute=Start.AddMinutes(-1).AddSeconds(-5);
    var handler=new QueueHandler((request,index)=>TextResponse(Page(minute,
        [Vehicle(Start.AddSeconds(-20),"FIXTURE-PRIV")],"cursor-"+index)));
    using var probe=Make(clock,handler);
    var result=await probe.ReadItsAsync(minute);
    Equal("its_pagination_incomplete",result.Reason);True(!result.Complete);
    Equal(5,result.Pages);Equal(5,handler.Requests);
    Equal(5,result.Rows.Count);
    Equal("inconclusive_absence",probe.Compare(result.Rows[0],result,FeedAt(Start.AddSeconds(-20)),FeedAt(Start.AddSeconds(-10)),Facility()).Relation);
    var repeated=new QueueHandler((request,_)=>TextResponse(Page(minute,cursor:"same")));
    using var second=Make(new FakeClock(Start),repeated);
    Equal("its_cursor_invalid",(await second.ReadItsAsync(minute)).Reason);
    Equal(2,repeated.Requests);
}

static Task MissingTripAndPhysicalIdentity()
{
    var clock=new FakeClock(Start);using var probe=Make(clock,new QueueHandler((_,_)=>throw new Exception("unexpected HTTP")));
    var gps=Start.AddSeconds(-20);
    var row=Vehicle(gps," 00-TEST-1 ","",null,null,Start.AddSeconds(-1));
    var physical=probe.Physical(row,out var reason);
    Equal("accepted",reason);True(physical!=null);
    Equal(" 00-TEST-1 ",physical!.OriginalId);Equal("00-TEST-1",physical.Id);
    Equal(gps,physical.PhysicalAt);Equal(Start.AddSeconds(-1),physical.ServerAt);
    Equal<string?>(null,physical.Service);Equal<string?>(null,physical.Route);Equal<string?>(null,physical.Trip);
    Equal<double?>(null,physical.Speed);
    var invalid=new GpsDatarioVehicleDto {IdVeiculo="ID",Fornecedor="ZIRIX",Sistema="sppo",Modo="onibus",
        Latitude=-22.9,Longitude=-43.55,Datetime="2026-10-28T12:00:45",DatetimeServidor=Start.ToString("O")};
    Equal<TerminalPreflight.Observation?>(null,probe.Physical(invalid,out reason));
    Equal("invalid_physical_time",reason);
    return Task.CompletedTask;
}

static Task GlobalIdentity()
{
    var clock=new FakeClock(Start);using var probe=Make(clock,new QueueHandler((_,_)=>throw new Exception("unexpected HTTP")));
    var row=probe.Physical(Vehicle(Start.AddSeconds(-20),"BUS-1",server:Start.AddSeconds(-30)),out _)!;
    var its=Its(Start.AddMinutes(-1).AddSeconds(-5),row);
    var before=FeedAt(Start.AddSeconds(-25),id:"BUS-1",route:"route_other");
    var after=FeedAt(Start.AddSeconds(-10));
    Equal("present_other_gtfs_line",probe.Compare(row,its,before,after,Facility()).Relation);
    var raw=Gtfs(Start.AddSeconds(-25),"BUS-1");
    var decoded=TerminalPreflight.DecodeGtfs(raw,Start);
    True(decoded.Global.ContainsKey("BUS-1")); // no Trip/Route is still globally indexed
    Equal("present_global_gtfs",probe.Compare(row,its,decoded,after,Facility()).Relation);
    return Task.CompletedTask;
}

static Task UnalignedCannotProveAbsence()
{
    var clock=new FakeClock(Start);using var probe=Make(clock,new QueueHandler((_,_)=>throw new Exception("unexpected HTTP")));
    var row=probe.Physical(Vehicle(Start.AddSeconds(-20),server:Start.AddSeconds(-30)),out _)!;
    var its=Its(Start.AddMinutes(-1).AddSeconds(-5),row);
    var before=FeedAt(Start.AddSeconds(-25));var after=FeedAt(Start.AddSeconds(-10));
    True(probe.Compare(row,its,before,after,Facility()).AbsenceComparable);
    Equal("not_observed_in_aligned_gtfs",probe.Compare(row,its,before,after,Facility()).Relation);
    foreach(var pair in new[]{(FeedAt(Start.AddMinutes(-3)),after), (before,FeedAt(Start.AddSeconds(-25))),
        (FeedAt(Start.AddSeconds(-25),coverage:false),after),(FeedAt(Start.AddSeconds(-25),complete:false),after)})
        Equal("inconclusive_absence",probe.Compare(row,its,pair.Item1,pair.Item2,Facility()).Relation);
    its.Complete=false;
    Equal("inconclusive_absence",probe.Compare(row,its,before,after,Facility()).Relation);
    return Task.CompletedTask;
}

static async Task CacheAndErrors()
{
    var clock=new FakeClock(Start);var body=Gtfs(Start.AddSeconds(-10));
    var handler=new QueueHandler((request,index)=>
    {
        if(index==1){var ok=BinaryResponse(body);ok.Headers.ETag=new EntityTagHeaderValue("\"fixture\"");return ok;}
        True(request.Headers.IfNoneMatch.Any(x=>x.Tag=="\"fixture\""));
        var cached=new HttpResponseMessage(HttpStatusCode.NotModified);
        cached.Headers.ETag=new EntityTagHeaderValue("\"fixture\"");return cached;
    });
    using(var probe=Make(clock,handler))
    {
        var first=await probe.ReadGtfsAsync();var second=await probe.ReadGtfsAsync();
        True(first.Complete&&second.Complete);
        Equal(first.GeneratedAt,second.GeneratedAt);
        var row=probe.Physical(Vehicle(clock.GetUtcNow().AddSeconds(-5),server:clock.GetUtcNow().AddSeconds(-20)),out _)!;
        Equal("inconclusive_absence",probe.Compare(row,Its(clock.GetUtcNow().AddMinutes(-1),row),first,second,Facility()).Relation);
    }
    foreach(var status in new[]{HttpStatusCode.TooManyRequests,HttpStatusCode.ServiceUnavailable})
    {
        var error=new QueueHandler((_,_)=>new HttpResponseMessage(status));
        using var probe=Make(new FakeClock(Start),error);
        Equal("provider_429_or_503",(await probe.ReadGtfsAsync()).Reason);Equal(1,error.Requests);
    }
    var retry=new QueueHandler((_,_)=>{var ok=BinaryResponse(body);ok.Headers.RetryAfter=new RetryConditionHeaderValue(TimeSpan.FromSeconds(60));return ok;});
    using(var probe=Make(new FakeClock(Start),retry))Equal("provider_retry_after_stop",(await probe.ReadGtfsAsync()).Reason);
    var bad304=new QueueHandler((_,_)=>new HttpResponseMessage(HttpStatusCode.NotModified));
    using(var probe=Make(new FakeClock(Start),bad304))Equal("gtfs_304_not_identified",(await probe.ReadGtfsAsync()).Reason);
}

static Task DuplicateAndRenewal()
{
    var clock=new FakeClock(Start);using var probe=Make(clock,new QueueHandler((_,_)=>throw new Exception("unexpected HTTP")));
    var first=probe.Physical(Vehicle(Start.AddSeconds(-30)),out _)!;
    var changed=first with {Service="884"};
    var ambiguous=Its(Start.AddMinutes(-1),first,changed);
    var summary=probe.Summarize(0,ambiguous,new(),new());
    Equal(1,summary.Groups["identity_ambiguous"]);
    True(summary.Renewal.Count==0);
    probe.Summarize(1,Its(Start.AddMinutes(-1),first),new(),new());
    var serverOnly=first with {ServerAt=Start};
    summary=probe.Summarize(2,Its(Start.AddMinutes(-1),serverOnly),new(),new());
    Equal(1,summary.Renewal["physical_repeated"]);
    True(!summary.Renewal.ContainsKey("stationary_with_new_physical_gps"));
    var regressed=first with {PhysicalAt=first.PhysicalAt.AddSeconds(-1)};
    summary=probe.Summarize(3,Its(Start.AddMinutes(-1),regressed),new(),new());
    Equal(1,summary.Renewal["physical_regressed"]);
    var moved=regressed with {Position=new(-22.91,-43.55)};
    summary=probe.Summarize(4,Its(Start.AddMinutes(-1),moved),new(),new());
    Equal(1,summary.Renewal["equal_gps_conflict"]);
    return Task.CompletedTask;
}

static Task FacilityGeometry()
{
    var point=Anchor;
    Equal("near_terminal",TerminalPreflight.Locate(point,Facility()));
    Equal("inside_trusted",TerminalPreflight.Locate(point,Facility(true)));
    Equal("uncertain_location",TerminalPreflight.Locate(new(-22.90199,-43.55),Facility(true)));
    Equal("uncertain_location",TerminalPreflight.Locate(new(-22.895,-43.55),Facility()));
    var invalid=Facility(true) with {TrustedPolygon=new([
        new(-22.902,-43.552),new(-22.898,-43.548),new(-22.902,-43.548),
        new(-22.898,-43.552),new(-22.897,-43.554),new(-22.902,-43.552)],"survey","v1",Start)};
    invalid.Anchors=[Anchor];
    try {TerminalPreflight.ValidateFacilities([invalid]);throw new Exception("crossing polygon accepted");}
    catch(TerminalPreflight.Stop e){Equal("trusted_geometry_self_intersecting",e.Reason);}
    return Task.CompletedTask;
}

static Task TemporalGateReasons()
{
    var clock=new FakeClock(Start);using var probe=Make(clock,new QueueHandler((_,_)=>throw new Exception("unexpected HTTP")));
    var row=probe.Physical(Vehicle(Start.AddSeconds(-20),server:Start.AddSeconds(-30)),out _)!;
    var its=Its(Start.AddMinutes(-1).AddSeconds(-5),row);
    var before=FeedAt(Start.AddSeconds(-25));var after=FeedAt(Start.AddSeconds(-10));
    var good=probe.Compare(row,its,before,after,Facility());
    True(good.AbsenceComparable);Equal(0,good.Reasons.Length);
    var old=row with {PhysicalAt=Start.AddSeconds(-61)};
    var aged=probe.Compare(old,its,before,after,Facility());
    Equal("inconclusive_absence",aged.Relation);
    Equal("physical_age_outside_0_to_60s",aged.Reasons.Single());
    Equal("server_time_missing_or_invalid",probe.Compare(row with {ServerAt=null},its,before,after,Facility()).Reasons.Single());
    Equal("server_time_outside_requested_minute",probe.Compare(row with {ServerAt=Start},its,before,after,Facility()).Reasons.Single());
    Equal("provider_unverified",probe.Compare(row with {Provider="OTHER"},its,before,after,Facility()).Reasons.Single());
    Equal("gtfs_generation_not_advanced",probe.Compare(row,its,before,FeedAt(before.GeneratedAt!.Value),Facility()).Reasons.Single());
    Equal("gtfs_before_physical_gap_over_60s",probe.Compare(row,its,FeedAt(Start.AddSeconds(-85)),after,Facility()).Reasons.Single());
    var stale=probe.Compare(row,its,FeedAt(Start.AddSeconds(-91)),after,Facility());
    True(stale.Reasons.Contains("gtfs_before_generation_older_than_90s"));
    True(stale.Reasons.Contains("gtfs_before_physical_gap_over_60s"));
    before.IdentityCoverage=false;its.Complete=false;
    var incomplete=probe.Compare(row,its,before,after,Facility());
    True(incomplete.Reasons.Contains("its_incomplete"));
    True(incomplete.Reasons.Contains("gtfs_before_identity_coverage_incomplete"));
    return Task.CompletedTask;
}

static Task AgeBands()
{
    var clock=new FakeClock(Start);using var probe=Make(clock,new QueueHandler((_,_)=>throw new Exception("unexpected HTTP")));
    var rows=new[]{30,60,120,180}.Select((seconds,i)=>new TerminalPreflight.Observation(
        "SYNTH-"+i,"SYNTH-"+i,"ZIRIX",Anchor,Start.AddSeconds(-seconds),Start.AddSeconds(-30),
        null,null,null,null,null)).ToArray();
    var its=Its(Start.AddMinutes(-1).AddSeconds(-5),rows);its.CompletedAt=Start.AddSeconds(-10);
    var summary=probe.Summarize(0,its,new(),new());
    var cell=summary.Diagnostics["fixture-terminal/near_terminal"];
    Equal(4,cell.Observations);Equal(4,cell.DistinctIdentities);Equal(4,cell.DistinctSourceIdentities);
    Equal(4,cell.NoGtfsGlobal);
    foreach(var band in new[]{"up_to_30s","over_30_to_60s","over_60_to_120s","over_120_to_180s"})
        Equal(1,cell.NoGtfsPhysicalAgeAtComparison[band]);
    Equal(1,cell.PhysicalAgeAtAcquisition["up_to_30s"]);
    Equal(1,cell.PhysicalAgeAtAcquisition["over_30_to_60s"]);
    Equal(1,cell.PhysicalAgeAtAcquisition["over_60_to_120s"]);
    Equal(1,cell.PhysicalAgeAtAcquisition["over_120_to_180s"]);
    Equal(4,cell.PrimaryInconclusiveReason["gtfs_before_incomplete"]);
    Equal(2,cell.InconclusiveReasons["physical_age_outside_0_to_60s"]);
    return Task.CompletedTask;
}

static Task CrossRoundCorrelation()
{
    var clock=new FakeClock(Start);using var probe=Make(clock,new QueueHandler((_,_)=>throw new Exception("unexpected HTTP")));
    TerminalPreflight.Observation Row(string id,string provider,DateTimeOffset gps,TerminalPreflight.Point? point=null)
        =>new(id,id,provider,point??Anchor,gps,clock.GetUtcNow().AddSeconds(-30),null,null,null,null,null);
    var first=Its(Start.AddMinutes(-1).AddSeconds(-5),
        Row("A","ZIRIX",Start.AddSeconds(-40)),Row("B","ZIRIX",Start.AddSeconds(-40)),
        Row("C","ZIRIX",Start.AddSeconds(-40)),Row("D","ZIRIX",Start.AddSeconds(-40)),
        Row("E","ZIRIX",Start.AddSeconds(-40)));
    var firstGtfs=FeedAt(Start.AddSeconds(-25),id:"C");
    probe.Summarize(0,first,firstGtfs,FeedAt(Start.AddSeconds(-5)));
    clock.Advance(TimeSpan.FromSeconds(60));
    var second=Its(clock.GetUtcNow().AddMinutes(-1).AddSeconds(-5),
        Row("A","ZIRIX",clock.GetUtcNow().AddSeconds(-10)),
        Row("B","CONECTA",clock.GetUtcNow().AddSeconds(-10)),
        Row("C","ZIRIX",clock.GetUtcNow().AddSeconds(-10)),
        Row("D","ZIRIX",Start.AddSeconds(-40)),
        Row("E","ZIRIX",clock.GetUtcNow().AddSeconds(-10),new(-22.9003,-43.55)));
    var summary=probe.Summarize(1,second,FeedAt(clock.GetUtcNow().AddSeconds(-25)),FeedAt(clock.GetUtcNow().AddSeconds(-5)));
    var overlap=summary.CrossRound["fixture-terminal/near_terminal"];
    Equal(4,overlap.SameSourceIdentityBothRounds); // B changed provider and cannot be silently joined.
    Equal(3,overlap.NoGtfsBothRounds); // C was globally present in GTFS in round one.
    Equal(3,overlap.PhysicalAdvanced); // D only changed server receipt time.
    Equal(2,overlap.AdvancedWithin10Metres); // E moved beyond ten metres.
    Equal(1,overlap.NoGtfsPhysicalAdvancedWithin10Metres);
    Equal(1,overlap.AlignedNoGtfsPhysicalAdvancedWithin10Metres);
    Equal(5,summary.Diagnostics["fixture-terminal/near_terminal"].DistinctIdentities);
    Equal(5,probe.DistinctIdentitiesAcrossCompleteRounds["fixture-terminal/near_terminal"]);
    var partial=Its(clock.GetUtcNow().AddMinutes(-1).AddSeconds(-5),
        Row("A","ZIRIX",clock.GetUtcNow().AddSeconds(-5)));
    partial.Complete=false;
    Equal(0,probe.Summarize(2,partial,new(),new()).CrossRound.Count);
    Equal(0,probe.Summarize(3,Its(clock.GetUtcNow().AddMinutes(-1).AddSeconds(-5),
        Row("A","ZIRIX",clock.GetUtcNow().AddSeconds(-2))),
        FeedAt(clock.GetUtcNow().AddSeconds(-25)),FeedAt(clock.GetUtcNow().AddSeconds(-5))).CrossRound.Count);
    Equal(5,probe.DistinctIdentitiesAcrossCompleteRounds["fixture-terminal/near_terminal"]);
    return Task.CompletedTask;
}

static Task LocalConflicts()
{
    var clock=new FakeClock(Start);using var probe=Make(clock,new QueueHandler((_,_)=>throw new Exception("unexpected HTTP")));
    var first=probe.Physical(Vehicle(Start.AddSeconds(-20),"SYNTH-CONFLICT",server:Start.AddSeconds(-30)),out _)!;
    var other=first with {Provider="CONECTA",Service="884"};
    var summary=probe.Summarize(0,Its(Start.AddMinutes(-1).AddSeconds(-5),first,other),new(),new());
    var cell=summary.Diagnostics["fixture-terminal/near_terminal"];
    Equal(1,cell.AmbiguousIdentities);Equal(1,cell.SourceConflicts);Equal(0,cell.Observations);
    var conflictingGtfs=FeedAt(Start.AddSeconds(-25),id:first.Id);
    conflictingGtfs.Global[first.Id][0]=new(first.Id,first.PhysicalAt,new(-22.901,-43.55),null);
    summary=probe.Summarize(1,Its(Start.AddMinutes(-1).AddSeconds(-5),first),conflictingGtfs,FeedAt(Start.AddSeconds(-10)));
    cell=summary.Diagnostics["fixture-terminal/near_terminal"];
    Equal(1,cell.SourceConflicts);Equal(0,cell.NoGtfsGlobal);
    using var compatible=Make(new FakeClock(Start),new QueueHandler((_,_)=>throw new Exception("unexpected HTTP")));
    summary=compatible.Summarize(0,Its(Start.AddMinutes(-1).AddSeconds(-5),first,
        first with {Provider="CONECTA"}),new(),new());
    cell=summary.Diagnostics["fixture-terminal/near_terminal"];
    Equal(2,cell.Observations);Equal(1,cell.DistinctIdentities);Equal(2,cell.DistinctSourceIdentities);
    return Task.CompletedTask;
}

static async Task ProviderAndMinuteCounts()
{
    var clock=new FakeClock(Start);var minute=Start.AddMinutes(-1).AddSeconds(-5);
    var a=Vehicle(Start.AddSeconds(-20),"SYNTH-A",server:minute.AddSeconds(20));
    var b=new GpsDatarioVehicleDto {IdVeiculo="SYNTH-B",Fornecedor="CONECTA",Sistema="sppo",Modo="onibus",
        Latitude=-22.9,Longitude=-43.55,Datetime=Start.AddSeconds(-20).ToString("O"),DatetimeServidor=Start.ToString("O")};
    var c=new GpsDatarioVehicleDto {IdVeiculo="SYNTH-C",Fornecedor="OTHER",Sistema="sppo",Modo="onibus",
        Latitude=-22.9,Longitude=-43.55,Datetime=Start.AddSeconds(-20).ToString("O")};
    var handler=new QueueHandler((_,_)=>TextResponse(Page(minute,[a,b,c])));
    using var probe=Make(clock,handler);
    var read=await probe.ReadItsAsync(minute);
    True(read.Complete);Equal(1,handler.Requests);Equal(3,read.RawRecords);
    Equal(1,read.RawProviders["ZIRIX"]);Equal(1,read.RawProviders["CONECTA"]);Equal(1,read.RawProviders["other"]);
    Equal(1,read.ServerMinuteStatus["within_requested_minute"]);
    Equal(1,read.ServerMinuteStatus["outside_requested_minute"]);
    Equal(1,read.ServerMinuteStatus["missing_or_invalid"]);
}

static async Task Privacy()
{
    var clock=new FakeClock(Start);
    var handler=new QueueHandler((request,_)=>
    {
        if(request.RequestUri==TerminalPreflight.GtfsUri)return BinaryResponse(Gtfs(clock.GetUtcNow().AddSeconds(-1)));
        var minute=clock.GetUtcNow().AddMinutes(-1);
        minute=new DateTimeOffset(minute.Year,minute.Month,minute.Day,minute.Hour,minute.Minute,0,TimeSpan.Zero);
        return TextResponse(Page(minute,[Vehicle(clock.GetUtcNow().AddSeconds(-10),"SECRET-VEHICLE-123",server:minute.AddSeconds(20),lat:-22.900123,lon:-43.550789)]));
    });
    using var probe=Make(clock,handler);
    var report=JsonSerializer.Serialize(await probe.RunAsync());
    True(!report.Contains("SECRET-VEHICLE-123")&&!report.Contains("-22.900123")&&
        !report.Contains("-43.550789")&&!report.Contains("datetime_servidor")&&
        !report.Contains("Authorization")&&!report.Contains("its.mobilidade.rio"));
    True(handler.Requests<=14);
}
}

sealed class FakeClock(DateTimeOffset initial) : TimeProvider
{
    private DateTimeOffset _now=initial;
    public override DateTimeOffset GetUtcNow()=>_now;
    public override long GetTimestamp()=>_now.UtcTicks;
    public override long TimestampFrequency=>TimeSpan.TicksPerSecond;
    public void Advance(TimeSpan span){if(span<TimeSpan.Zero)throw new Exception("negative fake delay");_now+=span;}
}
sealed class QueueHandler(Func<HttpRequestMessage,int,HttpResponseMessage> respond) : HttpMessageHandler
{
    public int Requests {get;private set;}
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var response=respond(request,++Requests);
        return Task.FromResult(response);
    }
}

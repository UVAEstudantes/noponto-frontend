using System.Net;
using System.Text.Json;
using TerminalPresenceLab;

// No network is constructed for plan or catalog inspection. Execution requires a future explicit opt-in.
var options=new JsonSerializerOptions {PropertyNamingPolicy=JsonNamingPolicy.CamelCase,WriteIndented=true};
if(args.Length==0||args is ["--plan"]){Console.WriteLine(JsonSerializer.Serialize(TerminalPreflight.Plan,options));return 0;}
if(args.Length!=5||args[1]!="--schedule"||args[3]!="--facilities"||args[0] is not ("--inspect-local" or "--execute-authorized"))
{Console.Error.WriteLine("Use --plan, or --inspect-local --schedule ZIP --facilities JSON. External execution requires separate authorization and --execute-authorized.");return 2;}
try
{
    var catalog=TerminalPreflight.LoadCatalog(args[2],args[4]);
    if(args[0]=="--inspect-local")
    {
        Console.WriteLine(JsonSerializer.Serialize(new {mode="offline_catalog",routes=catalog.RouteCodes.Count,
            facilities=catalog.Facilities.Select(f=>new {f.Id,f.Primary,anchors=f.Anchors.Length,trustedPolygon=f.TrustedPolygon!=null})},options));
        return 0;
    }
    using var cancellation=new CancellationTokenSource();
    Console.CancelKeyPress+=(_,e)=>{e.Cancel=true;cancellation.Cancel();};
    using var probe=new TerminalPreflight(new HttpClientHandler {AllowAutoRedirect=false,AutomaticDecompression=DecompressionMethods.None},
        TimeProvider.System,(delay,ct)=>Task.Delay(delay,ct),catalog.Facilities,catalog.RouteCodes);
    Console.WriteLine(JsonSerializer.Serialize(await probe.RunAsync(cancellation.Token),options));return 0;
}
catch(TerminalPreflight.Stop e){Console.Error.WriteLine(JsonSerializer.Serialize(new {status="preflight_not_completed",reason=e.Reason}));return 1;}
catch(Exception e) when(e is IOException or JsonException or FormatException or InvalidOperationException)
{Console.Error.WriteLine(JsonSerializer.Serialize(new {status="local_input_or_contract_error",type=e.GetType().Name}));return 1;}
catch(Exception e)
{Console.Error.WriteLine(JsonSerializer.Serialize(new {status="preflight_failed_safely",type=e.GetType().Name}));return 1;}

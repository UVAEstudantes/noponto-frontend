import * as signalR from "@microsoft/signalr";
import { VeiculoTempoReal } from "@/src/types/transporte";

const HUB_URL =
  process.env.EXPO_PUBLIC_SIGNALR_URL ??
  "http://xxx/hub/gps";

let connection: signalR.HubConnection | null = null;

export function iniciarGpsHub(
  onUpdate: (veiculos: VeiculoTempoReal[]) => void,
): signalR.HubConnection {

  if (connection) {
    return connection;
  }

  connection = new signalR.HubConnectionBuilder()
    .withUrl(HUB_URL)
    .withAutomaticReconnect()
    .build();

  connection.on(
    "PosicaoAtualizada",
    (veiculos: VeiculoTempoReal[]) => {

      console.log(
        "🚍 realtime recebido:",
        veiculos?.length ?? 0,
      );

      onUpdate(veiculos ?? []);
    },
  );

  connection.onreconnecting(() => {
    console.log("🔄 reconectando SignalR...");
  });

  connection.onreconnected(() => {
    console.log("✅ reconectado");
  });

  connection.onclose(() => {
    console.log("❌ conexão encerrada");
  });

  return connection;
}

export async function conectarGpsHub(): Promise<void> {

  if (!connection) return;

  if (
    connection.state ===
    signalR.HubConnectionState.Connected ||
    connection.state ===
    signalR.HubConnectionState.Connecting
  ) {
    return;
  }

  try {

    await connection.start();

    console.log("✅ SignalR conectado");

  } catch (err) {

    console.error(
      "Erro ao conectar SignalR",
      err,
    );
  }
}

export async function inscreverLinha(
  codigoLinha: string,
): Promise<void> {

  if (!connection) return;

  if (
    connection.state !==
    signalR.HubConnectionState.Connected
  ) {

    console.log(
      "⏳ aguardando conexão SignalR..."
    );

    await conectarGpsHub();
  }

  try {

    await connection.invoke(
      "InscreverseLinha",
      codigoLinha,
    );

    console.log(
      "📡 inscrito na linha:",
      codigoLinha,
    );

  } catch (err) {

    console.error(
      "Erro ao inscrever",
      err,
    );
  }
}

export async function cancelarLinha(
  codigoLinha: string,
): Promise<void> {

  if (!connection) return;

  try {

    await connection.invoke(
      "CancelarLinha",
      codigoLinha,
    );

    console.log(
      "📴 cancelado:",
      codigoLinha,
    );

  } catch (err) {

    console.error(
      "Erro ao cancelar",
      err,
    );
  }
}
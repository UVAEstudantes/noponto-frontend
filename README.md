# NoPonto

Aplicativo mobile desenvolvido com React Native, Expo e NativeWind (Tailwind CSS).

## 🚀 Tecnologias

- **React Native** 0.81.5
- **Expo** ~54.0.23
- **Expo Router** ~6.0.14 (File-based routing)
- **NativeWind** 4.2.1 (Tailwind CSS para React Native)
- **TypeScript** ~5.9.2
- **pnpm** - Gerenciador de pacotes

## 📁 Estrutura do Projeto

```
NoPonto/
├── app/                      # Rotas do Expo Router
│   ├── (tabs)/              # Grupo de tabs
│   │   ├── _layout.tsx      # Layout das tabs
│   │   ├── index.tsx        # Tela inicial
│   │   └── explore.tsx      # Tela de exploração
│   ├── _layout.tsx          # Layout principal
│   └── modal.tsx            # Modal de exemplo
├── src/
│   ├── components/          # Componentes reutilizáveis
│   ├── services/           # Serviços (API, etc)
│   ├── types/              # Tipos TypeScript
│   ├── utils/              # Funções utilitárias
│   └── styles/             # Estilos customizados
├── assets/                 # Imagens e recursos estáticos
├── components/             # Componentes base do Expo
├── constants/              # Constantes da aplicação
└── hooks/                  # Hooks customizados

```

## 🛠️ Setup

### Pré-requisitos

- Node.js (v18 ou superior)
- pnpm (`npm install -g pnpm`)
- Expo Go no seu dispositivo móvel
- Expo CLI global (opcional): `npm install -g expo-cli`

### Instalação

1. Clone o repositório
2. Instale as dependências:

```bash
pnpm install
```

3. Copie o arquivo de ambiente:

```bash
cp .env.example .env
```

## 🏃‍♂️ Rodando o Projeto

### Com Tunnel (Recomendado para Expo Go)

```bash
pnpm start
```

ou

```bash
pnpm expo start --tunnel
```

### Localmente (sem tunnel)

```bash
pnpm start:local
```

### Android/iOS específico

```bash
pnpm android  # Android com tunnel
pnpm ios      # iOS com tunnel
```

## 🎨 Usando Tailwind CSS (NativeWind)

Você pode usar classes do Tailwind diretamente no `className` dos componentes:

```tsx
import { View, Text } from "react-native";

export function MyComponent() {
  return (
    <View className="flex-1 bg-white p-4">
      <Text className="text-2xl font-bold text-blue-600">Olá, NativeWind!</Text>
    </View>
  );
}
```

### Classes úteis do Tailwind:

- **Layout**: `flex`, `flex-row`, `flex-col`, `justify-center`, `items-center`
- **Espaçamento**: `p-4`, `m-2`, `px-6`, `py-3`, `gap-4`
- **Cores**: `bg-blue-500`, `text-white`, `border-gray-300`
- **Tamanhos**: `w-full`, `h-screen`, `w-1/2`
- **Tipografia**: `text-xl`, `font-bold`, `text-center`
- **Bordas**: `rounded-lg`, `border-2`, `shadow-lg`

Consulte a [documentação do Tailwind](https://tailwindcss.com/docs) para mais classes.

## 📱 Conectando ao Expo Go

1. Instale o **Expo Go** no seu dispositivo:
   - [Android](https://play.google.com/store/apps/details?id=host.exp.exponent)
   - [iOS](https://apps.apple.com/app/expo-go/id982107779)

2. Execute `pnpm start` no terminal

3. Escaneie o QR code:
   - **Android**: Use o Expo Go
   - **iOS**: Use a câmera do iPhone

4. O app carregará automaticamente no seu dispositivo

## 🔧 Scripts Disponíveis

- `pnpm start` - Inicia o servidor de desenvolvimento com tunnel
- `pnpm start:local` - Inicia o servidor sem tunnel
- `pnpm android` - Abre no Android com tunnel
- `pnpm ios` - Abre no iOS com tunnel
- `pnpm web` - Abre no navegador web
- `pnpm lint` - Executa o linter
- `pnpm reset-project` - Reseta o projeto

## 📚 Recursos Úteis

- [Documentação do Expo](https://docs.expo.dev/)
- [Documentação do Expo Router](https://docs.expo.dev/router/introduction/)
- [Documentação do NativeWind](https://www.nativewind.dev/)
- [Documentação do Tailwind CSS](https://tailwindcss.com/docs)
- [React Native Docs](https://reactnative.dev/)

## 🤝 Contribuindo

1. Crie uma branch para sua feature (`git checkout -b feature/MinhaFeature`)
2. Commit suas mudanças (`git commit -m 'Adiciona MinhaFeature'`)
3. Push para a branch (`git push origin feature/MinhaFeature`)
4. Abra um Pull Request

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

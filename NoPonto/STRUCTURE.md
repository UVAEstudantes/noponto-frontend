# 📖 Guia de Estrutura do Projeto NoPonto

## 📁 Estrutura de Pastas

### `/app` - Rotas do Expo Router
O Expo Router usa file-based routing. Cada arquivo nesta pasta representa uma rota.

```
app/
├── _layout.tsx          # Layout raiz (importa global.css aqui!)
├── modal.tsx            # Exemplo de modal
└── (tabs)/             # Grupo de tabs (parênteses = não aparece na URL)
    ├── _layout.tsx      # Configura as tabs
    ├── index.tsx        # Tela inicial (/)
    └── explore.tsx      # Tela explore (/explore)
```

**Como criar novas rotas:**
- `app/profile.tsx` → `/profile`
- `app/settings/index.tsx` → `/settings`
- `app/settings/[id].tsx` → `/settings/:id` (rota dinâmica)
- `app/(auth)/login.tsx` → `/login` (grupo não aparece na URL)

### `/src` - Código da Aplicação

#### `/src/components` - Componentes Reutilizáveis
Componentes que você usa em várias telas.

```tsx
// src/components/button.tsx
import { TouchableOpacity, Text } from 'react-native';

interface ButtonProps {
  title: string;
  onPress: () => void;
}

export function Button({ title, onPress }: ButtonProps) {
  return (
    <TouchableOpacity 
      className="bg-blue-600 rounded-lg px-6 py-3"
      onPress={onPress}
    >
      <Text className="text-white font-semibold text-center">
        {title}
      </Text>
    </TouchableOpacity>
  );
}
```

#### `/src/services` - Lógica de Negócio e APIs
Serviços para comunicação com backend, autenticação, etc.

```tsx
// src/services/auth.service.ts
import { api } from './api';

export const authService = {
  login: async (email: string, password: string) => {
    return await api.post('/auth/login', { email, password });
  },
  
  logout: async () => {
    // lógica de logout
  },
};
```

#### `/src/types` - Tipos TypeScript
Interfaces e tipos compartilhados.

```tsx
// src/types/user.ts
export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}
```

#### `/src/utils` - Funções Utilitárias
Helpers e funções auxiliares.

```tsx
// src/utils/format.ts
export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};
```

#### `/src/hooks` - Custom Hooks
Hooks React personalizados.

```tsx
// src/hooks/use-async.ts
import { useState, useEffect } from 'react';

export function useAsync<T>(asyncFn: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    asyncFn()
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}
```

### `/components` - Componentes Base do Expo
Componentes criados pelo template do Expo. Pode mover para `/src/components` se quiser.

### `/constants` - Constantes da Aplicação
Valores fixos usados no app.

```tsx
// constants/colors.ts
export const Colors = {
  primary: '#007AFF',
  secondary: '#5856D6',
  success: '#34C759',
  error: '#FF3B30',
  warning: '#FF9500',
};
```

### `/assets` - Arquivos Estáticos
Imagens, fontes, ícones, etc.

```
assets/
├── images/
│   ├── logo.png
│   └── icon.png
└── fonts/
    └── custom-font.ttf
```

## 🎨 Usando NativeWind (Tailwind CSS)

### Classes Mais Usadas

**Layout:**
```tsx
<View className="flex-1">                    {/* flex: 1 */}
<View className="flex-row">                  {/* flexDirection: row */}
<View className="justify-center items-center"> {/* centralizar */}
<View className="absolute top-0 left-0">    {/* posição absoluta */}
```

**Espaçamento:**
```tsx
<View className="p-4">      {/* padding: 16px */}
<View className="px-6 py-3"> {/* padding horizontal e vertical */}
<View className="m-2">      {/* margin: 8px */}
<View className="gap-4">    {/* gap entre filhos */}
```

**Tamanhos:**
```tsx
<View className="w-full">     {/* width: 100% */}
<View className="h-screen">   {/* height: 100vh */}
<View className="w-1/2">      {/* width: 50% */}
<View className="min-h-20">   {/* minHeight: 80px */}
```

**Cores:**
```tsx
<View className="bg-blue-500">       {/* background */}
<Text className="text-white">        {/* cor do texto */}
<View className="border-gray-300">   {/* cor da borda */}
```

**Bordas:**
```tsx
<View className="rounded-lg">      {/* border radius */}
<View className="border-2">        {/* border width */}
<View className="shadow-lg">       {/* sombra */}
```

**Texto:**
```tsx
<Text className="text-xl">        {/* fontSize: 20px */}
<Text className="font-bold">      {/* fontWeight: bold */}
<Text className="text-center">    {/* textAlign: center */}
<Text className="uppercase">      {/* text-transform */}
```

### Exemplo Completo

```tsx
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';

export function MyScreen() {
  return (
    <ScrollView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-blue-600 p-6 pt-12">
        <Text className="text-white text-2xl font-bold">
          Minha Tela
        </Text>
      </View>

      {/* Content */}
      <View className="p-4">
        {/* Card */}
        <View className="bg-white rounded-xl p-5 shadow-md mb-4">
          <Text className="text-lg font-semibold text-gray-800 mb-2">
            Título do Card
          </Text>
          <Text className="text-gray-600">
            Descrição do card com texto explicativo.
          </Text>
        </View>

        {/* Button */}
        <TouchableOpacity 
          className="bg-blue-600 rounded-lg py-3 px-6"
          activeOpacity={0.7}
        >
          <Text className="text-white font-semibold text-center">
            Clique Aqui
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
```

## 🔄 Fluxo de Desenvolvimento

1. **Criar uma nova tela:**
   - Adicione um arquivo em `app/` (ex: `app/profile.tsx`)
   - Use componentes do `src/components`

2. **Criar um componente:**
   - Crie em `src/components/` (ex: `src/components/user-card.tsx`)
   - Exporte como função

3. **Adicionar tipos:**
   - Defina em `src/types/` (ex: `src/types/user.ts`)
   - Importe onde precisar

4. **Criar serviços:**
   - Adicione em `src/services/` (ex: `src/services/user.service.ts`)
   - Use para chamadas de API

5. **Funções auxiliares:**
   - Crie em `src/utils/` (ex: `src/utils/validators.ts`)

## 📱 Comandos Úteis

```bash
# Iniciar com tunnel (padrão)
pnpm start

# Iniciar localmente
pnpm start:local

# Limpar cache e reiniciar
pnpm start -- --clear

# Ver logs
pnpm start -- --dev-client
```

## 🐛 Dicas e Troubleshooting

### Problema: App não carrega no Expo Go
- Verifique se está usando `--tunnel`
- Certifique-se que está na mesma rede
- Limpe o cache: `pnpm start -- --clear`

### Problema: Tailwind não funciona
- Verifique se importou `../global.css` no `app/_layout.tsx`
- Reinicie o metro bundler
- Limpe o cache: `pnpm start -- --clear`

### Problema: Erros de TypeScript
- Execute `pnpm tsc --noEmit` para ver todos os erros
- Verifique se os tipos estão corretos
- Instale `@types/` se necessário

## 📚 Recursos

- [Expo Router Docs](https://docs.expo.dev/router/introduction/)
- [NativeWind Docs](https://www.nativewind.dev/)
- [Tailwind Classes](https://tailwindcss.com/docs)
- [React Native Docs](https://reactnative.dev/)

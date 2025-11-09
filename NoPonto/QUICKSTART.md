# 🚀 Quick Start - NoPonto

## ✅ Configuração Concluída!

Seu projeto está configurado com:
- ✨ **NativeWind** (Tailwind CSS para React Native)
- 🗂️ **Estrutura organizada** de pastas
- 🔄 **Expo Router** para navegação
- 📱 **Tunnel mode** por padrão
- 💙 **TypeScript** configurado

## 🏃‍♂️ Iniciar o Projeto

```bash
pnpm start
```

O servidor vai iniciar em modo **tunnel** automaticamente.
Escaneie o QR code com o **Expo Go** no seu celular!

## 📱 Exemplo de Uso do Tailwind

```tsx
// app/(tabs)/index.tsx
import { View, Text } from 'react-native';

export default function HomeScreen() {
  return (
    <View className="flex-1 bg-white items-center justify-center p-4">
      <Text className="text-2xl font-bold text-blue-600 mb-4">
        Olá, NoPonto! 👋
      </Text>
      <View className="bg-gray-100 rounded-lg p-6 w-full">
        <Text className="text-gray-700">
          Use Tailwind CSS diretamente!
        </Text>
      </View>
    </View>
  );
}
```

## 📂 Onde Colocar Cada Coisa

| O que você quer fazer | Onde criar |
|----------------------|------------|
| Nova tela/rota | `app/nome-da-tela.tsx` |
| Componente reutilizável | `src/components/nome.tsx` |
| Chamar API | `src/services/nome.service.ts` |
| Tipos TypeScript | `src/types/nome.ts` |
| Função auxiliar | `src/utils/nome.ts` |
| Hook customizado | `src/hooks/use-nome.ts` |

## 🎨 Classes Tailwind Mais Usadas

### Layout
- `flex-1` - Ocupa espaço disponível
- `flex-row` / `flex-col` - Direção
- `justify-center` - Centralizar horizontalmente
- `items-center` - Centralizar verticalmente

### Espaçamento
- `p-4` - Padding 16px
- `m-2` - Margin 8px
- `gap-4` - Espaço entre elementos

### Cores
- `bg-blue-600` - Background azul
- `text-white` - Texto branco
- `border-gray-300` - Borda cinza

### Tipografia
- `text-xl` - Texto grande
- `font-bold` - Negrito
- `text-center` - Centralizar texto

### Bordas
- `rounded-lg` - Bordas arredondadas
- `shadow-lg` - Sombra

## 📚 Documentação Completa

Veja `STRUCTURE.md` para documentação detalhada da estrutura do projeto.

## 🆘 Problemas Comuns

**App não carrega?**
```bash
pnpm start -- --clear
```

**Tailwind não funciona?**
- Verifique se `global.css` está importado em `app/_layout.tsx`
- Reinicie o servidor com `--clear`

**TypeScript com erro?**
```bash
pnpm tsc --noEmit
```

## 📖 Links Úteis

- [Tailwind CSS Cheatsheet](https://tailwindcss.com/docs)
- [NativeWind Docs](https://www.nativewind.dev/)
- [Expo Router](https://docs.expo.dev/router/introduction/)

---

**Dica:** Comece editando `app/(tabs)/index.tsx` para ver suas mudanças ao vivo! 🎉

# Regras permanentes — NoPonto

Centralizar os relatórios técnicos `.md` produzidos pelo Codex em `noponto-docs`, organizados por data e área. Consultar as instruções dos diretórios envolvidos antes de alterações.

## Política obrigatória de diretórios e branches

1. Utilizar exclusivamente os diretórios oficiais `noponto-frontend`, `noponto-backend` e `noponto-docs` para desenvolvimento.
2. **É proibido criar Git worktrees, clones adicionais ou pastas separadas para branches**, salvo autorização explícita do usuário.
3. Toda branch nova deve ser criada e utilizada dentro do diretório original de seu repositório.
4. Antes de trocar de branch, verificar alterações locais e preservar arquivos não commitados.
5. Nunca descartar arquivos locais, ignorados ou não rastreados sem autorização.
6. Preservar `.env`, dependências, configurações de Android, Firebase, arquivos locais e demais recursos ignorados pelo Git.
7. Nunca fazer commits diretamente na `main` do frontend.
8. Criar commits progressivos nas branches de trabalho sempre que uma correção ou etapa verificável for concluída.
9. Antes de qualquer operação Git que possa sobrescrever arquivos locais, conferir seu impacto e evitar perda de trabalho.
10. Não criar estruturas alternativas de desenvolvimento por iniciativa própria.

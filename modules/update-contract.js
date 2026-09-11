/* UPDATE CONTRACT v2
  1. Incrementar APP_VERSION.
  2. Incrementar DB_VERSION somente quando houver mudança de esquema.
  3. Criar migração em migrate() antes de usar campos novos.
  4. Nunca apagar stores nem registros históricos.
  5. Exclusão deve ser lógica/arquivamento.
  6. Preservar data original das compras.
  7. Atualizações de interface não devem alterar o catálogo sem regra explícita.
  8. Fazer backup JSON antes de substituir o pacote.
*/
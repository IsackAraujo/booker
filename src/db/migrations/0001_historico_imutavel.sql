-- US03-CA4: o histórico de operações não pode ser alterado nem apagado.
CREATE OR REPLACE FUNCTION audit_log_imutavel() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log é somente inclusão';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_log_sem_alteracao
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_imutavel();

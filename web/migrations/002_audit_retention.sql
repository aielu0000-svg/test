-- Audit history must survive physical deletion of a project or user.
ALTER TABLE audit_logs DROP FOREIGN KEY fk_audit_user;
ALTER TABLE audit_logs DROP FOREIGN KEY fk_audit_project;

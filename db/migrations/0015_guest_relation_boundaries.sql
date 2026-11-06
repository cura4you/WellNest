CREATE FUNCTION demo_user_workspace(value UUID) RETURNS UUID LANGUAGE SQL STABLE AS
 $$ SELECT demo_workspace_id FROM users WHERE id=value $$;
CREATE FUNCTION demo_patient_workspace(value UUID) RETURNS UUID LANGUAGE SQL STABLE AS
 $$ SELECT u.demo_workspace_id FROM patients p JOIN users u ON u.id=p.user_id WHERE p.id=value $$;
CREATE FUNCTION enforce_demo_relation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE a UUID; b UUID; c UUID;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'documents' THEN
      a:=demo_patient_workspace(NEW.patient_id);b:=demo_user_workspace(NEW.uploaded_by_user_id);
      IF NEW.hospital_id IS NOT NULL THEN SELECT demo_user_workspace(user_id) INTO c FROM hospitals WHERE id=NEW.hospital_id; IF c IS DISTINCT FROM a THEN RAISE EXCEPTION 'Workspace boundary' USING ERRCODE='23514'; END IF; END IF;
    WHEN 'document_access_grants' THEN a:=demo_patient_workspace(NEW.patient_id);b:=demo_user_workspace(NEW.grantee_user_id);SELECT demo_patient_workspace(patient_id) INTO c FROM documents WHERE id=NEW.document_id;IF c IS DISTINCT FROM a THEN RAISE EXCEPTION 'Workspace boundary' USING ERRCODE='23514';END IF;
    WHEN 'access_requests' THEN a:=demo_patient_workspace(NEW.patient_id);b:=demo_user_workspace(NEW.requester_user_id);
    WHEN 'appointments' THEN a:=demo_user_workspace(NEW.patient_user_id);b:=demo_user_workspace(NEW.provider_user_id);c:=demo_user_workspace(NEW.created_by_user_id);IF c IS DISTINCT FROM a THEN RAISE EXCEPTION 'Workspace boundary' USING ERRCODE='23514';END IF;
    WHEN 'appointment_events' THEN SELECT demo_user_workspace(patient_user_id) INTO a FROM appointments WHERE id=NEW.appointment_id;b:=demo_user_workspace(NEW.actor_user_id);
    WHEN 'drug_interactions' THEN a:=demo_patient_workspace(NEW.patient_id);b:=demo_user_workspace(NEW.doctor_user_id);
    WHEN 'emergency_access_events' THEN a:=demo_patient_workspace(NEW.patient_id);b:=demo_user_workspace(NEW.requester_user_id);
    WHEN 'audit_logs' THEN a:=demo_patient_workspace(NEW.patient_id);b:=demo_user_workspace(NEW.actor_user_id);
    WHEN 'chat_message_citations' THEN SELECT demo_user_workspace(s.user_id) INTO a FROM chat_messages m JOIN chat_sessions s ON s.id=m.session_id WHERE m.id=NEW.message_id;SELECT demo_patient_workspace(patient_id) INTO b FROM documents WHERE id=NEW.document_id;
  END CASE;
  IF a IS DISTINCT FROM b THEN RAISE EXCEPTION 'Workspace boundary' USING ERRCODE='23514';END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER demo_documents_scope BEFORE INSERT OR UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION enforce_demo_relation();
CREATE TRIGGER demo_grants_scope BEFORE INSERT OR UPDATE ON document_access_grants FOR EACH ROW EXECUTE FUNCTION enforce_demo_relation();
CREATE TRIGGER demo_requests_scope BEFORE INSERT OR UPDATE ON access_requests FOR EACH ROW EXECUTE FUNCTION enforce_demo_relation();
CREATE TRIGGER demo_appointments_scope BEFORE INSERT OR UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION enforce_demo_relation();
CREATE TRIGGER demo_appointment_events_scope BEFORE INSERT OR UPDATE ON appointment_events FOR EACH ROW EXECUTE FUNCTION enforce_demo_relation();
CREATE TRIGGER demo_interactions_scope BEFORE INSERT OR UPDATE ON drug_interactions FOR EACH ROW EXECUTE FUNCTION enforce_demo_relation();
CREATE TRIGGER demo_emergency_scope BEFORE INSERT OR UPDATE ON emergency_access_events FOR EACH ROW EXECUTE FUNCTION enforce_demo_relation();
CREATE TRIGGER demo_audit_scope BEFORE INSERT OR UPDATE ON audit_logs FOR EACH ROW EXECUTE FUNCTION enforce_demo_relation();
CREATE TRIGGER demo_citations_scope BEFORE INSERT OR UPDATE ON chat_message_citations FOR EACH ROW EXECUTE FUNCTION enforce_demo_relation();

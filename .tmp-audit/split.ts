import { splitSqlStatements, sanitizeBaselineSqlForManagementApi } from "../src/lib/installation/baseline-sql";
import fs from "node:fs";
const raw = fs.readFileSync("supabase/baseline-snapshot/007_delta_migrations.sql","utf8");
const prepared = sanitizeBaselineSqlForManagementApi(raw);
const st = splitSqlStatements(prepared.sql);
console.log("total statements", st.length);
const keys = ["post_copy_queue_state","ai_phase_error","post_copy_queue_notify","requires_own_supabase_token","feature_catalog"];
st.forEach((s,i)=>{ for(const k of keys) if(s.includes(k)) console.log(i, k, "|", s.slice(0,80).replace(/\s+/g," ")); });

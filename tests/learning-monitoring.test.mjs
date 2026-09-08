import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

const utils = ts.transpileModule(
  fs.readFileSync(
    new URL("../src/lib/learningMonitoring.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const { daysUntilTrainingEnd, csvCell, formatScoreChange } = await import(
  `data:text/javascript;base64,${Buffer.from(utils).toString("base64")}`
);

test("WITA calendar deadline and CSV safety", () => {
  assert.equal(
    daysUntilTrainingEnd(
      "2026-09-08T23:59:59+08:00",
      Date.parse("2026-09-08T23:00:00+08:00"),
    ),
    0,
  );
  assert.equal(
    daysUntilTrainingEnd(
      "2026-09-09T00:01:00+08:00",
      Date.parse("2026-09-08T23:59:00+08:00"),
    ),
    1,
  );
  assert.equal(
    daysUntilTrainingEnd(
      "2026-10-01T00:00:00+08:00",
      Date.parse("2026-09-30T23:00:00+08:00"),
    ),
    1,
  );
  assert.equal(daysUntilTrainingEnd("invalid"), null);
  assert.equal(daysUntilTrainingEnd(), null);
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
  assert.equal(csvCell(' A,"B"'), '" A,""B"""');
  assert.equal(formatScoreChange(-20), "-20");
  assert.equal(formatScoreChange(0), "0");
  assert.equal(formatScoreChange(null), "—");
});

test("SQL monitoring: pairing, completion, draft exclusion, activity and authorization", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA private;
 CREATE TABLE profiles(id UUID PRIMARY KEY, full_name TEXT, email TEXT, role TEXT);
 CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::UUID $$;
 CREATE FUNCTION private.is_lms_admin() RETURNS BOOLEAN LANGUAGE SQL AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin') $$;
 CREATE TABLE trainings(id UUID PRIMARY KEY,title TEXT,passing_score INT,active BOOLEAN DEFAULT true,start_date TIMESTAMPTZ,end_date TIMESTAMPTZ);
 CREATE TABLE materials(id UUID PRIMARY KEY,training_id UUID,active BOOLEAN,content TEXT);
 CREATE TABLE material_progress(user_id UUID,material_id UUID,started_at TIMESTAMPTZ DEFAULT now(),completed_at TIMESTAMPTZ);
 CREATE TABLE test_attempts(id UUID DEFAULT gen_random_uuid(),user_id UUID,training_id UUID,test_type TEXT,score NUMERIC,started_at TIMESTAMPTZ DEFAULT now(),submitted_at TIMESTAMPTZ DEFAULT now());
 CREATE TABLE test_sessions(user_id UUID,training_id UUID,test_type TEXT,status TEXT,answers JSONB,question_snapshot JSONB,updated_at TIMESTAMPTZ DEFAULT now(),submitted_at TIMESTAMPTZ);
 CREATE TABLE training_reviews(user_id UUID,training_id UUID,created_at TIMESTAMPTZ DEFAULT now());
 CREATE TABLE certificates(user_id UUID,training_id UUID,issued_at TIMESTAMPTZ DEFAULT now());`);
    const sql = fs.readFileSync(
      new URL(
        "../supabase/sql/migrations/031_learning_monitoring_and_analytics.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql);
    const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
    const admin = id(1),
      a = id(2),
      b = id(3),
      c = id(4),
      t = id(10),
      other = id(11),
      m = id(20),
      inactive = id(21),
      otherM = id(22),
      q = id(30);
    await db.exec(`INSERT INTO profiles VALUES ('${admin}','Admin','admin@test','admin'),('${a}','A','a@test','peserta'),('${b}','B','b@test','peserta'),('${c}','C','c@test','peserta');
 SELECT set_config('request.jwt.claim.sub','${admin}',false);
 INSERT INTO trainings(id,title,passing_score) VALUES ('${t}','Training',80),('${other}','Other',80);
 INSERT INTO materials VALUES ('${m}','${t}',true,'content must not be downloaded'),('${inactive}','${t}',false,'hidden'),('${otherM}','${other}',true,'other content');
 INSERT INTO test_attempts(user_id,training_id,test_type,score) VALUES ('${a}','${t}','pretest',100),('${a}','${t}','posttest',100),('${b}','${t}','pretest',0);
 INSERT INTO test_sessions(user_id,training_id,test_type,status,answers,question_snapshot) VALUES ('${c}','${t}','pretest','in_progress','{}','[]'),('${b}','${t}','posttest','in_progress','{"${q}":"B"}','[{"id":"${q}","question":"Example","correct_answer":"A"}]');`);
    const summary = async () =>
      (await db.query(`SELECT admin_training_learning_summary('${t}') value`))
        .rows[0].value;
    const progress = async () =>
      (await db.query(`SELECT * FROM admin_training_progress('${t}')`)).rows;
    let s = await summary();
    assert.equal(s.improvement, 0);
    assert.equal(s.paired_count, 1);
    assert.equal(s.pretest_average, 100);
    assert.equal(s.posttest_average, 100);
    assert.equal(s.completed, 0);
    assert.equal(s.posttest_completed, 1);
    assert.equal(
      (await db.query(`SELECT * FROM admin_question_analysis('${t}')`)).rows
        .length,
      0,
    );
    let rows = await progress();
    assert.equal(
      rows.find((r) => r.user_id === c).learning_status,
      "Sedang Pre-Test",
    );
    assert.ok(rows.find((r) => r.user_id === c).last_activity_at);
    assert.equal(
      rows.find((r) => r.user_id === b).learning_status,
      "Sedang Post-Test",
    );
    await db.exec(`INSERT INTO material_progress(user_id,material_id,completed_at) VALUES ('${a}','${inactive}',now()),('${a}','${otherM}',now());
 INSERT INTO training_reviews(user_id,training_id) VALUES ('${a}','${t}');`);
    assert.equal((await summary()).completed, 0); // Unrelated/inactive materials cannot satisfy completion.
    await db.exec(
      `INSERT INTO material_progress(user_id,material_id,completed_at) VALUES ('${a}','${m}',now());`,
    );
    assert.equal((await summary()).completed, 1);
    assert.equal(
      (await progress()).find((r) => r.user_id === a).learning_status,
      "Selesai",
    );
    await db.exec(`UPDATE test_sessions SET status='submitted',submitted_at=now() WHERE user_id='${b}';
 INSERT INTO test_attempts(user_id,training_id,test_type,score) VALUES ('${b}','${t}','posttest',20);`);
    assert.equal((await summary()).completed, 1); // Failed post-test is not completion.
    assert.equal(
      (await progress()).find((r) => r.user_id === b).learning_status,
      "Belum Lulus",
    );
    assert.equal(
      Number(
        (await db.query(`SELECT * FROM admin_question_analysis('${t}')`))
          .rows[0].answered_count,
      ),
      1,
    );
    assert.equal(
      (await db.query(`SELECT * FROM admin_training_progress('${t}','A',1,0)`))
        .rows.length,
      1,
    );
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${b}',false);`);
    await assert.rejects(
      db.query(`SELECT admin_training_learning_summary('${t}')`),
      /admin/,
    );
    await assert.rejects(
      db.query(`SELECT * FROM admin_training_progress('${t}')`),
      /admin/,
    );
    await assert.rejects(
      db.query(`SELECT * FROM admin_question_analysis('${t}')`),
      /admin/,
    );
    const own = (await db.query("SELECT * FROM my_training_overview()")).rows;
    assert.equal(own.find((r) => r.training.id === t).best_post_score, "20");
    assert.equal(
      own.find((r) => r.training.id === other).best_post_score,
      null,
    );
    assert.equal(own.find((r) => r.training.id === t).completed_materials, 0);
    assert.ok(!JSON.stringify(own).includes("content must not"));
    assert.equal(
      (
        await db.query(
          "SELECT has_function_privilege('authenticated','private.learning_progress_rows(uuid,uuid)','EXECUTE') allowed",
        )
      ).rows[0].allowed,
      false,
    );
    await db.exec(`SELECT set_config('request.jwt.claim.sub','',false);`);
    await assert.rejects(
      db.query("SELECT * FROM my_training_overview()"),
      /peserta/,
    );
    await assert.rejects(
      db.query(`SELECT admin_training_learning_summary('${t}')`),
      /admin/,
    );
  } finally {
    await db.close();
  }
});

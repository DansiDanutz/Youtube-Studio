-- YuteStudio delta migration against the existing MoltBot control-plane DB.
-- Reuses video_projects / video_scenes / video_renders / user_avatars / user_voices / library_scenes.
-- Reuses gsd_projects / gsd_tasks / task_plans / task_plan_steps / task_runs for roadmap tracking.
-- Reuses agent_messages / agent_token_usage / fleet_operations / ai_usage for fleet-wide ops.
-- Adds only the 3 things YuteStudio needs that do not already exist:
--   1) yute_milestones  — M1..M6 registry with acceptance/gate/budget config
--   2) yute_approvals   — G1..G5 human gate decisions (Telegram bridge writes here)
--   3) yute_run_meta    — per-run tier + pipeline state + budget wrapper over video_projects
--
-- Applied to MoltBot (project ref okgwzwdtuhhpoyxyprzg) on 2026-04-14
-- as migration name: yute_studio_delta_m1_setup

create table if not exists public.yute_milestones (
  id            text primary key,
  title         text not null,
  week_target   int  not null,
  budget_cents  int  not null default 0,
  status        text not null default 'pending'
                check (status in ('pending','in_progress','blocked','done')),
  acceptance    jsonb not null default '[]'::jsonb,
  gate          text,
  smoke_test    text,
  next_milestone text,
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists yute_milestones_status_idx on public.yute_milestones(status);

create table if not exists public.yute_approvals (
  id            bigserial primary key,
  milestone_id  text references public.yute_milestones(id) on delete set null,
  project_id    uuid references public.video_projects(id) on delete set null,
  gate          text not null,
  requested_by  text not null,
  approver      text,
  decision      text not null default 'pending'
                check (decision in ('pending','approved','rejected','timeout')),
  reason        text,
  evidence      jsonb not null default '{}'::jsonb,
  requested_at  timestamptz not null default now(),
  decided_at    timestamptz
);
create index if not exists yute_approvals_gate_idx on public.yute_approvals(gate);
create index if not exists yute_approvals_decision_idx on public.yute_approvals(decision);
create index if not exists yute_approvals_milestone_idx on public.yute_approvals(milestone_id);

create table if not exists public.yute_run_meta (
  project_id    uuid primary key references public.video_projects(id) on delete cascade,
  tier          text not null default 'free'
                check (tier in ('free','standard','pro','enterprise')),
  pipeline_state text not null default 'IDEA'
                check (pipeline_state in ('IDEA','PROMPT','RESEARCH','SCRIPT','RENDER','REVIEW','MERGE','PUBLISH','FAILED','CANCELLED')),
  budget_cents  int  not null default 300,
  spent_cents   int  not null default 0,
  flags         jsonb not null default '{}'::jsonb,
  manifest      jsonb not null default '{}'::jsonb,
  metrics       jsonb not null default '{}'::jsonb,
  started_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists yute_run_meta_state_idx on public.yute_run_meta(pipeline_state);
create index if not exists yute_run_meta_tier_idx on public.yute_run_meta(tier);

create or replace function public.yute_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists yute_milestones_touch on public.yute_milestones;
create trigger yute_milestones_touch before update on public.yute_milestones
  for each row execute function public.yute_touch_updated_at();

drop trigger if exists yute_run_meta_touch on public.yute_run_meta;
create trigger yute_run_meta_touch before update on public.yute_run_meta
  for each row execute function public.yute_touch_updated_at();

insert into public.yute_milestones (id, title, week_target, budget_cents, acceptance, gate, smoke_test, next_milestone) values
  ('M1','Scaffold + prompt enhancer + research + script',       4, 2000,
    '["repo live","CI green","migration applied","smoke test passes","G1 approval recorded"]'::jsonb,
    'G1','scripts/smoke_m1.py','M2'),
  ('M2','TTS (Chatterbox/Kokoro/F5) + image gen (FLUX) on Nano/Dexter', 8, 4000,
    '["tts produces wav","image gen produces png","assets land in storage","G2 approval recorded"]'::jsonb,
    'G2','scripts/smoke_m2.py','M3'),
  ('M3','Video gen (Wan 2.2 / LTX) + composition (FFmpeg/MoviePy) on Memo', 14, 6000,
    '["scene video renders","composition merges scenes","final mp4 produced","G3 approval recorded"]'::jsonb,
    'G3','scripts/smoke_m3.py','M4'),
  ('M4','Avatar (MuseTalk/LivePortrait) on Sienna + BGM (AudioCraft)',    18, 6000,
    '["avatar lip-sync ok","bgm mixed","G4 approval recorded"]'::jsonb,
    'G4','scripts/smoke_m4.py','M5'),
  ('M5','Publish to YouTube + thumbnail + SEO pack',              22, 4000,
    '["video uploaded as unlisted","thumbnail attached","title/desc/tags saved","G5 approval recorded"]'::jsonb,
    'G5','scripts/smoke_m5.py','M6'),
  ('M6','Autonomous loop: Growth/Discovery/Hermes + tier routing + budget guard', 26, 8000,
    '["ambient scheduler live","budget guard enforced","growth loop proposes ideas","end-to-end run completes"]'::jsonb,
    null,'scripts/smoke_m6.py',null)
on conflict (id) do update set
  title          = excluded.title,
  week_target    = excluded.week_target,
  budget_cents   = excluded.budget_cents,
  acceptance     = excluded.acceptance,
  gate           = excluded.gate,
  smoke_test     = excluded.smoke_test,
  next_milestone = excluded.next_milestone;

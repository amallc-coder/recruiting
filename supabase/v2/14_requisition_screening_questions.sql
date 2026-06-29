-- Migration: requisition_screening_questions
-- Per-requisition default screening question set. Holds an array of
-- { id, question, rationale?, competency? } that seeds every screening
-- created for a candidate tied to the requisition (see src/lib/v2/screenings.ts
-- getRequisitionQuestions / setRequisitionQuestions and the Screening questions
-- config card on the requisition detail page). Additive + nullable-safe:
-- existing rows default to an empty set, so nothing screens differently until
-- a recruiter curates a set.

alter table public.requisitions
  add column if not exists screening_questions jsonb not null default '[]'::jsonb;

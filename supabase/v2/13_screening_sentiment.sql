-- Conversational screening: sentiment + recording on the screening row, so the
-- recruiter readout shows the call sentiment and a link to the recording.
-- Additive/nullable. Applied to prod via migration `screening_sentiment_recording`.

alter table public.screenings
  add column if not exists sentiment_score integer,   -- 0-100 (0 negative … 100 positive)
  add column if not exists sentiment_label text,      -- positive | neutral | negative
  add column if not exists recording_url   text;

comment on column public.screenings.sentiment_score is 'AI-derived candidate sentiment during the screening, 0-100';

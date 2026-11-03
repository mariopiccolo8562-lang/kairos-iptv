-- 2.4.1: assistente IA anche con Claude (Anthropic): domande e parole usate per stimare la spesa
ALTER TABLE ai_usage ADD COLUMN cl INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_usage ADD COLUMN cl_in INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_usage ADD COLUMN cl_out INTEGER NOT NULL DEFAULT 0;


ALTER TABLE public.deployments
ADD COLUMN stage TEXT DEFAULT 'production';

-- Add deployed_url column to projects table
ALTER TABLE public.projects 
ADD COLUMN deployed_url text DEFAULT NULL;
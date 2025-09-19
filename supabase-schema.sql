-- Supabase Database Schema for OVO Application
-- Run these SQL commands in your Supabase SQL editor

-- Enable Row Level Security (remove this line as it's not needed)
-- ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret';

-- Create batches table (simplified - no need for cafeterias table)
CREATE TABLE IF NOT EXISTS batches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_by_fingerprint TEXT NOT NULL,
  confirmations_needed INTEGER DEFAULT 2,
  confirmed_count INTEGER DEFAULT 0,
  pending_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create batch_votes table
CREATE TABLE IF NOT EXISTS batch_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
  client_fingerprint TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(batch_id, client_fingerprint)
);

-- Create ratings table
CREATE TABLE IF NOT EXISTS ratings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
  sabor INTEGER NOT NULL CHECK (sabor >= 1 AND sabor <= 10),
  jugosidad INTEGER NOT NULL CHECK (jugosidad >= 1 AND jugosidad <= 10),
  cuajada INTEGER NOT NULL CHECK (cuajada >= 1 AND cuajada <= 10),
  temperatura INTEGER NOT NULL CHECK (temperatura >= 1 AND temperatura <= 10),
  score_overall INTEGER,
  comment TEXT CHECK (LENGTH(comment) <= 255),
  client_fingerprint TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add score_overall column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='ratings' AND column_name='score_overall') THEN
        ALTER TABLE ratings ADD COLUMN score_overall INTEGER;
    END IF;
END $$;

-- Add image_url column to ratings if it doesn't exist (used by API)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ratings' AND column_name = 'image_url'
    ) THEN
        ALTER TABLE ratings ADD COLUMN image_url TEXT;
    END IF;
END $$;

-- Comment likes table (likes for ratings with comments)
CREATE TABLE IF NOT EXISTS comment_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rating_id UUID NOT NULL REFERENCES ratings(id) ON DELETE CASCADE,
  client_fingerprint TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (rating_id, client_fingerprint)
);

-- Comment reactions table (emoji reactions per rating/comment)
CREATE TABLE IF NOT EXISTS comment_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rating_id UUID NOT NULL REFERENCES ratings(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK (reaction IN ('🔥','😂','🐐')),
  client_fingerprint TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (rating_id, client_fingerprint, reaction)
);

-- Outage votes table (community reporting)
CREATE TABLE IF NOT EXISTS outage_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint VARCHAR(255) NOT NULL,
  ip_address INET NOT NULL,
  vote_type VARCHAR(20) NOT NULL CHECK (vote_type IN ('outage', 'working')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fix outage_votes table structure completely
DO $$ 
BEGIN
    -- Add fingerprint column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='outage_votes' AND column_name='fingerprint') THEN
        ALTER TABLE outage_votes ADD COLUMN fingerprint VARCHAR(255);
    END IF;
    
    -- Add ip_address column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='outage_votes' AND column_name='ip_address') THEN
        ALTER TABLE outage_votes ADD COLUMN ip_address INET;
    END IF;
    
    -- Add vote_type column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='outage_votes' AND column_name='vote_type') THEN
        ALTER TABLE outage_votes ADD COLUMN vote_type VARCHAR(20);
    END IF;
    
    -- Add is_active column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='outage_votes' AND column_name='is_active') THEN
        ALTER TABLE outage_votes ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
    
    -- Add updated_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='outage_votes' AND column_name='updated_at') THEN
        ALTER TABLE outage_votes ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
    
    -- Update NULL values and set constraints
    UPDATE outage_votes SET fingerprint = 'legacy_' || id::text WHERE fingerprint IS NULL;
    UPDATE outage_votes SET ip_address = '127.0.0.1'::inet WHERE ip_address IS NULL;
    UPDATE outage_votes SET vote_type = 'outage' WHERE vote_type IS NULL;
    UPDATE outage_votes SET is_active = true WHERE is_active IS NULL;
    UPDATE outage_votes SET updated_at = NOW() WHERE updated_at IS NULL;
    
    -- Set NOT NULL constraints
    ALTER TABLE outage_votes ALTER COLUMN fingerprint SET NOT NULL;
    ALTER TABLE outage_votes ALTER COLUMN ip_address SET NOT NULL;
    ALTER TABLE outage_votes ALTER COLUMN vote_type SET NOT NULL;
    
    -- Add check constraint for vote_type if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints 
                   WHERE constraint_name = 'outage_votes_vote_type_check') THEN
        ALTER TABLE outage_votes ADD CONSTRAINT outage_votes_vote_type_check 
        CHECK (vote_type IN ('outage', 'working'));
    END IF;
END $$;

-- Global availability state table
CREATE TABLE IF NOT EXISTS availability_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_available BOOLEAN NOT NULL DEFAULT false,
  available_votes INTEGER DEFAULT 0,
  unavailable_votes INTEGER DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert initial availability state (only if table is empty)
INSERT INTO availability_state (is_available, available_votes, unavailable_votes) 
SELECT false, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM availability_state);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_batches_started_at ON batches(started_at);
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);
CREATE INDEX IF NOT EXISTS idx_batch_votes_batch_id ON batch_votes(batch_id);
CREATE INDEX IF NOT EXISTS idx_ratings_batch_id ON ratings(batch_id);
CREATE INDEX IF NOT EXISTS idx_ratings_created_at ON ratings(created_at);
CREATE INDEX IF NOT EXISTS idx_outage_votes_created_at ON outage_votes(created_at);
CREATE INDEX IF NOT EXISTS idx_outage_votes_is_active ON outage_votes(is_active);
CREATE INDEX IF NOT EXISTS idx_comment_likes_rating_id ON comment_likes(rating_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_rating_id ON comment_reactions(rating_id);

-- Enable Row Level Security-- Enable RLS on all tables
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE outage_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_reactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read access on batches" ON batches;
DROP POLICY IF EXISTS "Allow public insert on batches" ON batches;
DROP POLICY IF EXISTS "Allow public update on batches" ON batches;
DROP POLICY IF EXISTS "Allow public read access on batch_votes" ON batch_votes;
DROP POLICY IF EXISTS "Allow public insert on batch_votes" ON batch_votes;
DROP POLICY IF EXISTS "Allow public read access on ratings" ON ratings;
DROP POLICY IF EXISTS "Allow public insert on ratings" ON ratings;
DROP POLICY IF EXISTS "Allow public read access on outage_votes" ON outage_votes;
DROP POLICY IF EXISTS "Allow public insert on outage_votes" ON outage_votes;
DROP POLICY IF EXISTS "Allow public update on outage_votes" ON outage_votes;
DROP POLICY IF EXISTS "Allow public delete on outage_votes" ON outage_votes;

-- Create policies for public access
CREATE POLICY "Allow public read access on batches" ON batches FOR SELECT USING (true);
CREATE POLICY "Allow public insert on batches" ON batches FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on batches" ON batches FOR UPDATE USING (true);

CREATE POLICY "Allow public read access on batch_votes" ON batch_votes FOR SELECT USING (true);
CREATE POLICY "Allow public insert on batch_votes" ON batch_votes FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read access on ratings" ON ratings FOR SELECT USING (true);
CREATE POLICY "Allow public insert on ratings" ON ratings FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read access on outage_votes" ON outage_votes FOR SELECT USING (true);
CREATE POLICY "Allow public insert on outage_votes" ON outage_votes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on outage_votes" ON outage_votes FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on outage_votes" ON outage_votes FOR DELETE USING (true);

-- Policies for comment_likes
DROP POLICY IF EXISTS "Allow public read access on comment_likes" ON comment_likes;
DROP POLICY IF EXISTS "Allow public insert on comment_likes" ON comment_likes;
DROP POLICY IF EXISTS "Allow public delete on comment_likes" ON comment_likes;

CREATE POLICY "Allow public read access on comment_likes" ON comment_likes FOR SELECT USING (true);
CREATE POLICY "Allow public insert on comment_likes" ON comment_likes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete on comment_likes" ON comment_likes FOR DELETE USING (true);

-- Policies for comment_reactions
DROP POLICY IF EXISTS "Allow public read access on comment_reactions" ON comment_reactions;
DROP POLICY IF EXISTS "Allow public insert on comment_reactions" ON comment_reactions;
DROP POLICY IF EXISTS "Allow public delete on comment_reactions" ON comment_reactions;

CREATE POLICY "Allow public read access on comment_reactions" ON comment_reactions FOR SELECT USING (true);
CREATE POLICY "Allow public insert on comment_reactions" ON comment_reactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete on comment_reactions" ON comment_reactions FOR DELETE USING (true);

-- Enable RLS on availability_state table
ALTER TABLE availability_state ENABLE ROW LEVEL SECURITY;

-- Create policies for availability_state
CREATE POLICY "Allow public read access on availability_state" ON availability_state FOR SELECT USING (true);
CREATE POLICY "Allow public update on availability_state" ON availability_state FOR UPDATE USING (true);

-- Create functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for automatic timestamp updates
DROP TRIGGER IF EXISTS update_batches_updated_at ON batches;
CREATE TRIGGER update_batches_updated_at BEFORE UPDATE ON batches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Archive tables to store deleted ratings and their comments/reactions
CREATE TABLE IF NOT EXISTS archive_ratings (
  id UUID PRIMARY KEY,
  batch_id UUID,
  sabor INTEGER,
  jugosidad INTEGER,
  cuajada INTEGER,
  temperatura INTEGER,
  score_overall INTEGER,
  comment TEXT,
  client_fingerprint TEXT,
  ip_hash TEXT,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS archive_comment_reactions (
  id UUID PRIMARY KEY,
  rating_id UUID,
  reaction TEXT,
  client_fingerprint TEXT,
  ip_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Function to archive rating and related reactions before delete
CREATE OR REPLACE FUNCTION archive_rating_and_relations()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO archive_ratings (id, batch_id, sabor, jugosidad, cuajada, temperatura, score_overall, comment, client_fingerprint, ip_hash, image_url, created_at)
  VALUES (OLD.id, OLD.batch_id, OLD.sabor, OLD.jugosidad, OLD.cuajada, OLD.temperatura, OLD.score_overall, OLD.comment, OLD.client_fingerprint, OLD.ip_hash, OLD.image_url, OLD.created_at);

  INSERT INTO archive_comment_reactions (id, rating_id, reaction, client_fingerprint, ip_hash, created_at)
  SELECT r.id, r.rating_id, r.reaction, r.client_fingerprint, r.ip_hash, r.created_at
  FROM comment_reactions r WHERE r.rating_id = OLD.id;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger on ratings before delete
DROP TRIGGER IF EXISTS trg_archive_rating_before_delete ON ratings;
CREATE TRIGGER trg_archive_rating_before_delete
BEFORE DELETE ON ratings
FOR EACH ROW EXECUTE FUNCTION archive_rating_and_relations();

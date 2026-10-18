-- identity: what the Security page names a session by ("Chrome on Windows"). The raw User-Agent header of the
-- request that signed in, cut to 512 characters; null when the browser sent none, and for sessions that started
-- before this column existed. A refresh never changes it. No IP address is kept.

ALTER TABLE sessions
    ADD COLUMN user_agent VARCHAR(512);

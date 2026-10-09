-- Accept WebP photos from phones in the private OMS document bucket.
update storage.buckets set allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp','message/rfc822','application/octet-stream'] where id='oms-documents';

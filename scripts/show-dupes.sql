.width 8 100
.mode columns
with foo as (select distinct hash, source, contents from dupes)
SELECT
  hash,
  source,
  length(contents) size,
  substr(contents, 0, 100)
FROM dupes
ORDER BY size desc limit 10;

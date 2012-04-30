-- Comment for the code
-- MySQL Mode for CodeMirror2 by MySQLTools http://github.com/partydroid/MySQL-Tools
SELECT  UNIQUE `var1` as `variable`,
        MAX(`var5`) as `max`,
        MIN(`var5`) as `min`,
        STDEV(`var5`) as `dev`
FROM `table`

LEFT JOIN `table2` ON `var2` = `variable`

ORDER BY `var3` DESC
GROUP BY `groupvar`

LIMIT 0,30;


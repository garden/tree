-- Oracle PL/SQL Code Demo
/*
   based on c-like mode, adapted to PL/SQL by Peter Raganitsch ( http://www.oracle-and-apex.com/ )
   April 2011
*/
DECLARE
    vIdx    NUMBER;
    vString VARCHAR2(100);
    cText   CONSTANT VARCHAR2(100) := 'That''s it! Have fun with CodeMirror 2';
BEGIN
    vIdx := 0;
    --
    FOR rDATA IN
      ( SELECT *
          FROM EMP
         ORDER BY EMPNO
      )
    LOOP
        vIdx    := vIdx + 1;
        vString := rDATA.EMPNO || ' - ' || rDATA.ENAME;
        --
        UPDATE EMP
           SET SAL   = SAL * 101/100
         WHERE EMPNO = rDATA.EMPNO
        ;
    END LOOP;
    --
    SYS.DBMS_OUTPUT.Put_Line (cText);
END;
--


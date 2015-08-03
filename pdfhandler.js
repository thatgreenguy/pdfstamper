// pdfLogoStamper.js
//
// Description          :
// Author               : Paul Green
// Dated                : 2015-07-30
//
// Synopsis
// --------
// Expects to receive Date and Time values representing Time the calling program
// last performed a directory check
//
//
//

var oracledb = require('oracledb');

var credentials = { user: 'test_user', password: 'test_user', connectString: 'jdetest'};
var query = "";

oracledb.getConnection( credentials, function(err, connection) {
        if (err) throw err;

	var query = "SELECT * FROM testdta.f556110 WHERE jcactdate >= 115204 and jcjobsts = 'D' and rtrim(substr(JCFNDFUF2,0,instr(JCFNDFUF2,'_') - 1), ' ') in (select rtrim(PPFBDUBE, ' ') from testdta.f559850) ORDER BY jcactdate, jcacttime, jcfndfuf2";

        connection.execute( query, [], { resultSet: true }, function(err, results) {
                var rowsProcessed = 0;
                var startTime;
 
                if (err) throw err;
 
                startTime = Date.now();
 
                function processResultSet() {
                    results.resultSet.getRow(function(err, row) {
                        if (err) throw err;
 
                        if (row) {
                            rowsProcessed += 1;
 
                            //do work on the row here
			    console.log('ROW DATA:::: For row : ' + rowsProcessed);
			    console.log(row);
			    console.log('------------------------------------------');
				 			    
                            processResultSet(); //try to get another row from the result set
 
                            return; //exit recursive function prior to closing result set
                        }
 
                        console.log('Finish processing ' + rowsProcessed + ' rows');
                        console.log('Total time (in seconds):', ((Date.now() - startTime)/1000));
 
                        results.resultSet.close(function(err) {
                            if (err) console.error(err.message);
 
                            connection.release(function(err) {
                                if (err) console.error(err.message);
                            });
                        });
                    });
                }
 
                processResultSet();
            }
        );
    }
);

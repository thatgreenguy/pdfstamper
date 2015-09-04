// pdfmonitor.js
//
// Description		: Monitor the JDE output queue and whenever a change (new report) is detected trigger 
//			: further processing checks to handle logo images on select reports.
// Author		: Paul Green
// Dated		: 2015-09-03
//
// Synopsis
// --------
// This program starts when the container starts and constantly monitors the JDE PDF output queue for change.
// This program replaces most of the old style shell monitor program as use of sshfs is too heavy on cpu 
// resource on the AIX enterprise server due to encryption overhead.
// When a change is detected control is passed to the pdfhandler which performs further checks to see if 
// any logo related processing is required.
// This process uses date from last processed PDF file entry in the Audit Log file to keep the checking 
// query light and when a change is detected that triggers further processing. 


var oracledb = require( "oracledb" ),
    logger = require( "./common/logger" ),
    audit = require( "./common/audit.js" ),
    lock = require( "./common/lock.js" ),
    async = require( "async" ),
    exec = require( "child_process" ).exec,
    credentials = { user: process.env.DB_USER, password: process.env.DB_PWD, connectString: process.env.DB_NAME },
    pollInterval = 3000,
    serverTimeOffset = 5,
    hostname = process.env.HOSTNAME,
    previousPdf = "",
    numRows = 1,
    dirRemoteJdePdf = process.env.DIR_JDEPDF,
    dirLocalJdePdf = process.env.DIR_SHAREDDATA;


// Docker container Hostname is used for Audit logging and lock file control so if not available 
// there is a problem.
if ( typeof( hostname ) === "undefined" || hostname === "" ) {
    logger.error( "pdfmonitor.js needs environment variable Hostname to be defined" );
    logger.error( "This should always be available in docker containers - something is wrong - Aborting!" );
    process.exit( 1 );
} else {
    logger.debug( "Docker Container Hostname is : " + hostname );
}


// Announce that this Pdf handler process has just started up - recorded in custom Jde Audit Log table
logger.info( "---------- START MONITORING PDF QUEUE -----------" );
audit.createAuditEntry( 'pdfmonitor', 'pdfstartup.js', hostname, 'Start Monitoring' );

// Get Oracle DB connection to re-use then make initial call to the recursive monitoring function
// this function will act on any new Jde Pdf files and once done will sleep and repeat 
oracledb.getConnection( credentials, function( err , connection ) {

    if (err) {
        logger.error( "Oracle DB Connection Failure" );
        return;
    }

    // Only interested in processing PDF files that have appeared in the PrintQueue since last run of this process
    // This query grabs the last date from Audit Log first as starting point for processing
    recursiveMonitor( connection );

});




// FUNCTIONS
//
// Recursive monitoring process repeatedly checks the Jde Job Control table for those report types flagged as requiring a Dlink logo
// When it detects that 1 or more new eligible Pdf files have been created it applies the logo image to each page.
// Once all identified Pdf files are processed this monitoring process sleeps for a short time then checks again
function recursiveMonitor( connection ) {

    var begin;

    begin  = new Date();
    
    logger.debug( "" );
    logger.debug( "Checking initiated : " + begin );

    queryJdeAuditlog( connection, begin );
};


// Need date and time of last processed PDF file by this program as starting point for this process run  
function queryJdeAuditlog( connection, begin ) {
    
    var query;

    query  = "SELECT paupmj, paupmt, pasawlatm FROM testdta.F559859 WHERE PAFNDFUF2 <> 'pdfmonitor' ORDER BY pasawlatm DESC";

    connection.execute( query, [], { resultSet: true }, function( err, result ) {
        if ( err ) {
            logger.error( err.message )
        };

        processResultsFromF559859( connection, result.resultSet, numRows, audit, begin );	
    }); 
}


// Process results from JDE Audit Log table Query but only interested in last Pdf job processed
// to determine date and time which is used to control further queries
function processResultsFromF559859( connection, rs, numRows, audit, begin ) {

    var record;

    rs.getRows( numRows, function( err, rows ) {
        if ( err ) { 
            oracleResultsetClose( connection, rs );

      	} else if ( rows.length == 0 ) {
            oracleResultsetClose( connection, rs );

	} else if ( rows.length > 0 ) {
		
            // Last audit entry retrieved
            // Process continues by querying the JDE Job Control Master file for eligible PDF's to process

            record = rows[ 0 ];
            logger.debug( record );
            oracleResultsetClose( connection, rs );
            queryJdeJobControl( connection, record, begin );
	}
    });
}


// Query the JDE Job Control Master file to fetch all PDF files generated since last audit entry
// Only select PDF jobs that are registered for post PDF processing e.g. R5542565 Invoice Print
function queryJdeJobControl( connection, record, begin ) {

    var auditTimestamp,
        query,
        result,
        jdeDate,
        jdeTime;


    // Issue with server clocks JDE and Linux being slightly out - approx 2.5 minutes.
    // This will be rectified but in case it happens again or times drift slightly in future 
    // Adjust query search date and time backwards by Offset - say 5 minutes - to allow for slightly different clock times
    // and to ensure a PDF completing on JDE when this query runs is still included
    auditTimestamp = record[ 2 ];
    result = audit.adjustTimestampByMinutes( auditTimestamp, - serverTimeOffset );
    jdedate = result.jdeDate;
    jdetime = result.jdeTime;
    
    query = "SELECT jcfndfuf2, jcactdate, jcacttime, jcprocessid FROM testdta.F556110 ";
    query += " WHERE jcjobsts = 'D' AND jcfuno = 'UBE' AND jcactdate >= ";
    query += jdedate;
    query += " AND RTRIM(SUBSTR(jcfndfuf2, 0, INSTR(jcfndfuf2, '_') - 1), ' ') in ( SELECT RTRIM(crpgm, ' ') FROM testdta.F559890 WHERE crcfgsid = 'PDFHANDLER') ";
    query += " ORDER BY jcactdate DESC, jcacttime DESC";
    
    logger.debug(result);
    logger.debug(query);

    connection.execute( query, [], { resultSet: true }, function( err, result ) {
        if ( err ) {
             logger.error( err.message )
        };
        
        processResultsFromF556110( connection, result.resultSet, numRows, audit, begin );	
    }); 
}


// Process results of query on JDE Job Control file 
function processResultsFromF556110( connection, rs, numRows, audit, begin ) {

    var latestRow,
        latestPdf,
        rowToProcess,
        finish;

    rs.getRows( numRows, function( err, rows ) {
        if ( err ) { 
            oracleResultsetClose( connection, rs );

        } else if ( rows.length == 0 ) {
            oracleResultsetClose( connection, rs );

        } else if ( rows.length > 0 ) {

            latestRow = rows[ 0 ];
            latestPdf = latestRow[ 0 ];
            
            logger.debug( "Latest UBE is : " + latestRow );
            logger.debug(" Previous UBE PDF is : " + previousPdf);
            logger.debug(" Latest UBE PDF is : " + latestPdf);

            // If latest JDE Pdf job name does not match the previous one we have a change so check and process in detail 
            if ( previousPdf === latestPdf ) {
                logger.debug( "No Change detected");

            } else {
                logger.info( " ");
                logger.info( "          >>>>  CHANGE detected  <<<<");
                logger.info( " ");
                previousPdf = latestPdf;

                // Process first PDF file here then call this same function to keep processing
                // each record until all done. 
		// ......

            }

            // Read next record
            // fetchRowsFromRS( connection, rs, numRows, audit );

            finish = new Date();
            logger.debug( "Checking completed : " + finish + " took " + ( finish - begin ) + " milliseconds" );

            // Finished processing so close result set
            oracleResultsetClose( connection, rs );

            // Sleep briefly then repeat check monitor indefinitely at polling interval
            setTimeout( function() { recursiveMonitor( connection, logger, credentials ) } , pollInterval );
        }
    }); 
}


// Close Oracle database result set
function oracleResultsetClose( connection, rs ) {

    rs.close( function( err ) {
        if ( err ) {
            logger.error(err.message);
            oracleConnectionRelease(); 
        }
    }); 
}


// Close Oracle database connection
function oracleConnectionRelease( connection ) {

    logger.debug( "Releasing Connection" );
    connection.release( function ( err ) {
        if ( err ) {
            logger.error( err.message );
        }
    });
}

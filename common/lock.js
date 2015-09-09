// Module		: lock.js
// Description		: Common PDF file locking related functions.
// Author		: Paul Green
// Dated		: 2015-08-04

  
var oracledb = require('oracledb'),
  audit = require('./audit.js'),
  credentials = { user: process.env.DB_USER, password: process.env.DB_PWD, connectString: process.env.DB_NAME};


// Function		: gainExclusivity
//
// Description		: Insert lock file entry for given PDF if returns okay then caller has exclusive use of PDF file.
// Author		: Paul Green
// Dated		: 2015-08-03
//
// Synopsis
// --------
// Expect valid JDE Job Control record to be passed along with callback function to process PDF if lock successful

exports.gainExclusivity = function(record, hostname, conn, processLockedPdfFile) {

	if (typeof(record) === 'undefined') { console.log('ERROR: Valid JDE Job Control Record Expected.'); return false; }
	if (typeof(processLockedPdfFile) !== 'function') { console.log('ERROR: Callback function expected to process PDF file.'); return false; }

	var jcfndfuf2 = record[0];
	var jcprocessid = record[3];

	var dt = new Date();
	var timestamp = audit.createTimestamp(dt);
	var jdetime = audit.getJdeAuditTime(dt);
	var jdedate = audit.getJdeJulianDate(dt);
	var jdetime = audit.getJdeAuditTime(dt);

	oracledb.getConnection( credentials, function(err, connection)
	{
		if (err) { console.log('Oracle DB Connection Failure'); return;	}

		var query = "INSERT INTO testdta.F559858 VALUES (:lkfndfuf2, :lksawlatm, :lkactivid, :lkpid, :lkjobn, :lkuser, :lkupmj, :lkupmt)";
	
		connection.execute(query, [jcfndfuf2, timestamp, hostname, 'PDFHANDLER', 'CENTOS', 'DOCKER', jdedate, jdetime ], { autoCommit: true }, function(err, result) 
		{
			if (err)
			{
				console.log(err.message);
				return false;
			}
			connection.release( function(err)
			{
				if (err)
				{
					console.log(err.message);
					return false;
				}
			});

			// Inserted without error so lock in place - safe to process this PDF file
			
			processLockedPdfFile(conn, record);
		});
  	});
}




// Function		: removeLock
//
// Description		: Remove lock file entry for given PDF once all processing completed.
// Author		: Paul Green
// Dated		: 2015-08-04
//
// Synopsis
// --------
// Expect valid JDE Job Control record to be passed

exports.removeLock = function(record, hostname) {

	if (typeof(record) === 'undefined') { console.log('ERROR: Valid JDE Job Control Record Expected.'); return false; }

	var jcfndfuf2 = record[0];
	var jcprocessid = record[3];

	var dt = new Date();
	var timestamp = audit.createTimestamp(dt);
	var jdetime = audit.getJdeAuditTime(dt);
	var jdedate = audit.getJdeJulianDate(dt);
	var jdetime = audit.getJdeAuditTime(dt);

	oracledb.getConnection( credentials, function(err, connection)
	{
		if (err) { console.log('Oracle DB Connection Failure'); return;	}

		var query = "DELETE FROM testdta.F559858 WHERE lkfndfuf2 = '" + jcfndfuf2  +"' AND lkactivid = '" + hostname + "'";
		connection.execute(query, [ ], { autoCommit: true }, function(err, result) 
		{
			if (err)
			{
				console.log(err.message);
				return false;
			}
			connection.release( function(err)
			{
				if (err)
				{
					console.log(err.message);
					return false;
				}
			});
		});
  	});
}

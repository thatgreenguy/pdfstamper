// Module		: audit.js
// Description		: Common Audit file logging related functions.
// Author		: Paul Green
// Dated		: 2015-08-03

  
var oracledb = require('oracledb');
var credentials = {user: 'test_user', password: 'test_user', connectString: 'jdetest'};


// Function		: createAuditEntry.js
//
// Description		: Insert new Audit entry into the audit log file.
// Author		: Paul Green
// Dated		: 2015-08-03
//
// Synopsis
// --------

exports.createAuditEntry = function() {

	oracledb.getConnection( credentials, function(err, connection)
	{
		if (err) { console.log('Oracle DB Connection Failure'); return;	}

		var query = "INSERT INTO testdta.F559859 VALUES (:pacfgsid, :pafndfuf2, :pablkk, :paactivid, :padeltastat, :papid, :pajobn, :pauser, :paupmj, :paupmt)";
	
		connection.execute(query, ['datetime etc', 'ubepdfname', '1', 'ctrid', 'status', 'PDFHANDLER', 'CENTOS', 'DOCKER', 115001, 101112 ], { autoCommit: true }, function(err, result) 
		{
			if (err)
			{
				 console.log(err.message);
			}
			connection.release( function(err)
			{
				if (err)
				{
					console.log(err.message);
					return;
				}
			});
		});
  	});
}




// Function 		: createAuditTimestamp.js 
//
// Description		: Create human readable timestamp string suitable for Audit Logging
// Author		: Paul Green
// Dated		: 2015-08-03
//
// Synopsis
// --------
// Returns timestamp string like 'YYYY-MM-DD T HH:MM:SS MMMMMMMMM'
// Date and time elements are padded with leading '0' by default.
// Date and Time separator characters are '-' and ':' by default.
// MMMMMMMMM is time as milliseconds since epoch to keep generated string unique for same second inserts to Audit Log table. 

exports.createTimestamp = function(dateSep, timeSep, padChar) {

	if (typeof(dateSep) === 'undefined') dateSep = '-';
	if (typeof(timeSep) === 'undefined') timeSep = ':';
	if (typeof(padChar) === 'undefined') padChar = '0';

	var d = new Date();

	return d.getFullYear() + dateSep + (padChar + d.getMonth()).slice(-2) + dateSep + (padChar + d.getDay()).slice(-2)
		+ ' T ' + (padChar + d.getHours()).slice(-2) + timeSep + (padChar + d.getMinutes()).slice(-2) + timeSep
		+ (padChar + d.getSeconds()).slice(-2) + ' ' + d.getTime();
}


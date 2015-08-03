// Module		: audit.js
// Description		: Common Audit file logging related functions.
// Author		: Paul Green
// Dated		: 2015-08-03

  
var oracledb = require('oracledb');
var credentials = {user: 'test_user', password: 'test_user', connectString: 'jdetest'};


// Function		: createAuditEntry
//
// Description		: Insert new Audit entry into the audit log file.
// Author		: Paul Green
// Dated		: 2015-08-03
//
// Synopsis
// --------

exports.createAuditEntry = function(pdfjob, genkey, ctrid, status) {

	if (typeof(pdfjob) === 'undefined') pdfjob = ' ';
	if (typeof(genkey) === 'undefined') genkey = ' ';
	if (typeof(ctrid) === 'undefined') ctrid = ' ';
	if (typeof(status) === 'undefined') status = ' ';

	var dt = new Date();
	var timestamp = exports.createTimestamp(dt);
	var jdedate = exports.getJdeJulianDate(dt);
	var jdetime = exports.getJdeAuditTime(dt);

	oracledb.getConnection( credentials, function(err, connection)
	{
		if (err) { console.log('Oracle DB Connection Failure'); return;	}

		var query = "INSERT INTO testdta.F559859 VALUES (:pasawlatm, :pafndfuf2, :pablkk, :paactivid, :padeltastat, :papid, :pajobn, :pauser, :paupmj, :paupmt)";
	
		connection.execute(query, [timestamp, pdfjob, genkey, ctrid, status, 'PDFHANDLER', 'CENTOS', 'DOCKER', jdedate, jdetime ], { autoCommit: true }, function(err, result) 
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




// Function 		: createAuditTimestamp 
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

exports.createTimestamp = function(dt, dateSep, timeSep, padChar) {

	if (typeof(dt) === 'undefined') dt = new Date();
	if (typeof(dateSep) === 'undefined') dateSep = '-';
	if (typeof(timeSep) === 'undefined') timeSep = ':';
	if (typeof(padChar) === 'undefined') padChar = '0';

	return dt.getFullYear() + dateSep + (padChar + (dt.getMonth()+1)).slice(-2) + dateSep + (padChar + dt.getDate()).slice(-2)
		+ ' T ' + (padChar + dt.getHours()).slice(-2) + timeSep + (padChar + dt.getMinutes()).slice(-2) + timeSep
		+ (padChar + dt.getSeconds()).slice(-2) + ' ' + dt.getTime();
}




exports.getJdeJulianDate = function(dt) {

// Function		: getJdeJulianDate
//
// Description		: Convert date to weird JDE Julian date
// Author		: Paul Green
// Dated		: 2015-08-03
//
// Synopsis
// --------
// JDE does not use real Julian dates rather some half baked version which only works for dates after 1900

	if (typeof(dt) === 'undefined') dt = new Date();

	var yyyy = dt.getFullYear() - 1900;
	var onejan = new Date(dt.getFullYear(), 0, 1);	
	var ddd = Math.ceil((dt - onejan) / 86400000);
	var julian = yyyy.toString() + ('000' + ddd).slice(-3);

	return julian;
} 




// Function		: getJdeTime
//
// Description		: Convert date to JDE Audit Time HHMMSS
// Author		: Paul Green
// Dated		: 2015-08-03
//
// Synopsis
// --------
// Return jde Aaudit time in format HHMMSS with no separators and leading 0's if required.

exports.getJdeAuditTime = function(dt, padChar) {

	if (typeof(dt) === 'undefined') dt = new Date();
	if (typeof(padChar) === 'undefined') padChar = '0';

	var jdetime = (padChar + dt.getHours()).slice(-2) + (padChar + dt.getMinutes()).slice(-2) + (padChar + dt.getSeconds()).slice(-2);

	return jdetime;

}

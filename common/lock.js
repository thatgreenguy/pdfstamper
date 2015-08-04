// Module		: lock.js
// Description		: Common PDF file locking related functions.
// Author		: Paul Green
// Dated		: 2015-08-04

  
var oracledb = require('oracledb');
var audit = require('./audit.js');

var credentials = {user: 'test_user', password: 'test_user', connectString: 'jdetest'};


// Function		: gainExclusivity
//
// Description		: Insert lock file entry for given PDF if returns okay then caller has exclusive use of PDF file.
// Author		: Paul Green
// Dated		: 2015-08-03
//
// Synopsis
// --------

exports.gainExclusivity = function(pdfjob, ctrid) {

	if (typeof(pdfjob) === 'undefined') { return false; }
	if (typeof(ctrid) === 'undefined') { return false; }

	var dt = new Date();
	var timestamp = audit.createTimestamp(dt);
	var jdetime = audit.getJdeAuditTime(dt);
	var jdedate = audit.getJdeJulianDate(dt);
	var jdetime = audit.getJdeAuditTime(dt);

	var well = false;

	oracledb.getConnection( credentials, function(err, connection)
	{
		if (err) { console.log('Oracle DB Connection Failure'); return;	}

		var query = "INSERT INTO testdta.F559858 VALUES (:lkfndfuf2, :lksawlatm, :lkactivid, :lkpid, :lkjobn, :lkuser, :lkupmj, :lkupmt)";
	
		connection.execute(query, [pdfjob, timestamp, ctrid, 'PDFHANDLER', 'CENTOS', 'DOCKER', jdedate, jdetime ], { autoCommit: true }, function(err, result) 
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

			well = true;
		});
  	});
	
	return well;

}



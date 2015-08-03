var oracledb = require('oracledb');

var credentials = {user: 'test_user', password: 'test_user', connectString: 'jdetest'};
var numRows = 10;

oracledb.getConnection( credentials, function(err, connection)
{
	if (err) { console.log('Oracle DB Connection Failure'); return;	}

	var query = "SELECT jcfndfuf2, jcactdate, jcacttime, jcprocessid FROM testdta.F556110 \
                     WHERE jcjobsts = 'D' AND jcsbmdate >= 115215 \
                     AND RTRIM(SUBSTR(jcfndfuf2, 0, INSTR(jcfndfuf2, '_') - 1), ' ') in ( SELECT RTRIM(ppfbdube, ' ') \
                     FROM testdta.F559850 ) ";
	
	conn = connection;
	
	connection.execute(query, [], { resultSet: true }, function(err, result) 
	{
		if (err) { console.log(err.message) };
		fetchRowsFromRS( connection, result.resultSet, numRows );	
	}); 
});


function fetchRowsFromRS(connection, resultSet, numRows)
{
  console.log('IN fetchRowsFromRS');
  resultSet.getRows( numRows, function(err, rows)
  {
   	if (err)
	{
        	resultSet.close(function(err)
		{
			if (err)
			{
				console.log(err.message);
				connection.release(function(err)
				{
					if (err)
					{
						console.log(err.message);
					}
				});
			}
		}); 
      	} else if (rows.length == 0)
	{
		resultSet.close(function(err)
		{
			if (err)
			{
				console.log(err.message);
				connection.release(function(err)
				{
					if (err)
					{
						console.log(err.message);
					}
				});
			}
		});
	} else if (rows.length > 0)
	{
        	console.log('>>>>>'); 
        	console.log(rows);
        	fetchRowsFromRS(connection, resultSet, numRows);
	}
  });
}







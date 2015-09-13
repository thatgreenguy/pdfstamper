var audit = require( './common/audit.js' );


var dt = new Date();
showTests( dt, ' Now' );

dt.setHours(0, 0, 0, 0);
showTests( dt, ' Midnight' );

dt.setHours(0, 0, 0, 1);
showTests( dt, 'Midnight + 1 sec' );

dt.setHours(0, 0, 0, -1);
showTests( dt, 'Midnight - 1 sec' );

dt.setMonth( 0 );
dt.setDate( 1 );
dt.setHours(0, 0, 0, 0);
showTests( dt, 'Midnight January 1st' );


dt.setMonth( 0 );
dt.setDate( 1 );
dt.setHours(0, 0, 0, 1);
showTests( dt, 'Midnight January 1st + 1 sec' );

dt.setMonth( 0 );
dt.setDate( 1 );
dt.setHours(0, 0, 0, -1);
showTests( dt, 'Midnight January 1st - 1 sec' );

dt.setYear(2014)
dt.setMonth( 0 );
dt.setDate( 1 );
dt.setHours(0, 0, 0, -1);
showTests( dt, 'Midnight January 1st - 1 sec' );
dt.setYear(2013)
dt.setMonth( 0 );
dt.setDate( 1 );
dt.setHours(0, 0, 0, -1);
showTests( dt, 'Midnight January 1st - 1 sec' );
dt.setYear(2012)
dt.setMonth( 0 );
dt.setDate( 1 );
dt.setHours(0, 0, 0, -1);
showTests( dt, 'Midnight January 1st - 1 sec' );
dt.setYear(2011)
dt.setMonth( 0 );
dt.setDate( 1 );
dt.setHours(0, 0, 0, -1);
showTests( dt, 'Midnight January 1st - 1 sec' );
dt.setYear(2010)
dt.setMonth( 0 );
dt.setDate( 1 );
dt.setHours(0, 0, 0, -1);
showTests( dt, 'Midnight January 1st - 1 sec' );



function showTests( dt, dsc ) {

  console.log( '                    : ' );
  console.log( 'Test                : ' + dsc );
  console.log( 'Date                : ' + dt );
  console.log( 'JDE Julian Date     : ' + audit.getJdeJulianDate( dt ) );
  console.log( 'JDE Julian Date New : ' + audit.getJdeJulianDateNew( dt ) );

}




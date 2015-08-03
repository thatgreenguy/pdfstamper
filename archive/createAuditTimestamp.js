// createAuditTimestamp.js 
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

exports.new = function(dateSep, timeSep, padChar) {

	if (typeof(dateSep) === 'undefined') dateSep = '-';
	if (typeof(timeSep) === 'undefined') timeSep = ':';
	if (typeof(padChar) === 'undefined') padChar = '0';

	var d = new Date();

	return d.getFullYear() + dateSep + (padChar + d.getMonth()).slice(-2) + dateSep + (padChar + d.getDay()).slice(-2)
		+ ' T ' + (padChar + d.getHours()).slice(-2) + timeSep + (padChar + d.getMinutes()).slice(-2) + timeSep
		+ (padChar + d.getSeconds()).slice(-2) + ' ' + d.getTime();
}


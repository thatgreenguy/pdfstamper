#!/bin/bash
#
# Note that this script blocks and runs until killed, so you may want to
# launch it as a background task.
#

# Establish sshfs mount to remote system that requires monitoring
DYNCMD="sshfs ${SSHFS_USER}@${SSHFS_HOSTDIR} /home/pdfdata"  
$DYNCMD

if [ $? -ne 0 ]
then 
	echo
	echo "--------- ERROR ------------"
	echo "Problem mounting remote directory to monitor"
	echo "Expecting 3 docker -e arguments for User, Pwd and Target Host:Directory"
	echo "Re-run Docker command and provide remote SSHFS User, Pwd and Host:Directory values"
	echo "Tried this command: '${DYNCMD}' but it failed!"
	exit 1
fi

# The absolute path of the directory containing this script.
DIR="$( cd "$( dirname "$0" )" && pwd)"

# Where is the top level project directory relative to this script?
PROJECT_DIR="/home"

# Set up a list of directories to monitor.
MONITOR=()
MONITOR+=( "${PROJECT_DIR}/pdfdata" )
 
# This file will be used as a timestamp reference point.
TIMESTAMP_FILE="/tmp/file-monitor-ts"
 
# The interval in seconds between each check on monitored files.
INTERVAL_SECONDS=2
# How long in the past to to set the timestamp on the reference file
# used for comparison. This is probably overkill, but when running
# Vagrant VMs with synced folders you can run into all sorts of
# interesting behavior with regard to updating timestamps.
LOOKBACK_SECONDS=5
 
# The last set of updates. We keep this for comparison purposes.
# Since the lookback covers multiple cycles of monitoring for changes
# we need to be able to update only if there are fresh changes in
# the present cycle.
LAST_UPDATES=""
 
# Loop indefinitely. Killing this process is the only way to exit it,
# which is fine, but you may want to add some sort of check on other
# criteria so that it can shut itself down in response to circumstances.
while [[ true ]] ; do
  # OS X has a date command signature that differs significantly from
  # that used in Linux distros.
  if [[ ${OSTYPE} =~ ^darwin ]]; then
    TIMESTAMP=`date +%s`
    TIMESTAMP=$(( ${TIMESTAMP} - ${LOOKBACK_SECONDS} ))
    TIMESTAMP=`date -r ${TIMESTAMP} +%m%d%H%M.%S`
  else
    TIMESTAMP=`date -d "-${LOOKBACK_SECONDS} sec" +%m%d%H%M.%S`
  fi
 
  # Create or update the reference timestamp file.
  touch -t ${TIMESTAMP} "${TIMESTAMP_FILE}"
 
  # Identify updates by comparison with the reference timestamp file.
  UPDATES=`find ${MONITOR[*]} -type f -newer ${TIMESTAMP_FILE}`
 
  if [[ "${UPDATES}" ]] ; then
    # Pass the updates through ls or stat in order to add a timestamp for
    # each result. Thus if the same file is updated several times over several
    # monitor cycles it will still trigger when compared to the prior set of
    # updates.
    if [[ ${OSTYPE} =~ ^darwin ]]; then
      UPDATES=`stat -F ${UPDATES}`
    else
      UPDATES=`ls --full-time ${UPDATES}`
    fi
 
    # Only take action if there are new changes in this monitor cycle.
    if [[ "${UPDATES}" != "${LAST_UPDATES}" ]] ; then
 
      # Action to take is to call Javascript function which handles Stamping Logos
	DT=date
	echo "Changes detected : ${DT}"
	node /src/pdfhandler.js
    fi
  fi
 
  LAST_UPDATES="${UPDATES}"
  sleep ${INTERVAL_SECONDS}
done

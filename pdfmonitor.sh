#!/bin/bash
#
# PDFMonitor.sh
# 
# Description	: Poll JDE Print Queue and perform post PDF Processing on certain files
# Author	: Paul Green
# Dated		: 2015-07-30
#
# Synopsis
# --------
# This shell program forms part of a dockerised container application
# It runs when the docker container starts
# It Polls the JDE PrintQueue directory on AIX
# Whenever new PDF files are detected it calls a Javascript program that performs
# post PDF processing actions on selected PDF files (see pdfhandler.js for more info).
# It also calls the Javascript PDFHandler program once when started to immediately deal
# with any PDF files sitting in the JDE PrintQueue since this program was last active.
# It establishes an sshfs mount to the AIX remote system that requires monitoring

# Establish mount to remote JDE enterprise server (AIX) system
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

# Container application creates /home/pdfdata directory which will be mounted using sshfs 
# to the actual remote AIX directory that holds the JDE PrintQueue pdf files.
# Create a list of directories to monitor - in this case just the one.
PROJECT_DIR="/home"
MONITOR=()
MONITOR+=( "${PROJECT_DIR}/pdfdata" )
 
# This file will be used as a timestamp reference point.
# The interval in seconds between each check on monitored files.
# Allow margin of error on timestamp cut-off of few seconds which 
# allows for slight differences in time between servers clocks
TIMESTAMP_FILE="/tmp/file-monitor-ts" 
INTERVAL_SECONDS=2
LOOKBACK_SECONDS=5
 
# The last set of updates. We keep this for comparison purposes.
# Since the lookback covers multiple cycles of monitoring for changes
# we need to be able to update only if there are fresh changes in
# the present cycle.
LAST_UPDATES=""
UPDATES=""

# STARTUP / RECOVERY
#
# If this container app crashed or the server was taken offline for a time then on startup
# might need to recover/process any JDE PDF's generated since last time this program was active.
# For example if the container is down no logos will be stamped on Invoice Prints so when it comes 
# back up and this script runs for first time then pass control over to the javascrip PDF handler
# to deal with any un-processed PDF files in the Print Queue  
NODEARGS=" 'S' '${HOSTNAME}' "
node ./src/pdfhandler ${NODEARGS} 

# Ensure Startup flag is not 'S' for all subsequent calls to pdfhandler set to 'M' for Monitor Loop
NODEARGS=" 'M' '${HOSTNAME}' "

# POLLING 
#
# Loop indefinitely - to stop this program stop the container. 
# This container application exists to monitor this directory and pass control over to the 
# PDF Handler progam to deal with new PDF's
while [[ true ]] ; do
  
  # Get time to check from adjusted by lookback seconds
  TIMESTAMP=`date -d "-${LOOKBACK_SECONDS} sec" +%m%d%H%M.%S`
 
  # Create or update the reference timestamp file.
  touch -t ${TIMESTAMP} "${TIMESTAMP_FILE}"
 
  # Identify updates by comparison with the reference timestamp file.
  UPDATES=`find ${MONITOR[*]} -type f -newer ${TIMESTAMP_FILE}`
  if [[ "${UPDATES}" ]] ; then

    # Pass the updates through ls in order to add a timestamp for each result.
    # If the same file is updated several times over several monitor cycles
    # it will still trigger when compared to the prior set of updates
    UPDATES=`ls --full-time ${UPDATES}`
 
    # When changes detected in the current monitor cycle call the javascript pdf handler.
    if [[ "${UPDATES}" != "${LAST_UPDATES}" ]] ; then
	node ./src/pdfhandler ${NODEARGS}
    fi
  fi
 
  LAST_UPDATES="${UPDATES}"
  sleep ${INTERVAL_SECONDS}
done

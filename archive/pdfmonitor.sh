!/bin/bash
#
# PDFMonitor.sh
# 
# Description	: Poll JDE Print Queue and perform post PDF Processing on certain files
# Author	: Paul Green
# Dated		: 2015-09-04
#
# Synopsis
# --------
# This shell program forms part of a dockerised container application
# It runs when the docker container starts
# It mounts two directories to the JDE enterprise server (AIX)
# It passes control over to a node application that monitors the JDE output queue on the AIX watching for changes
# i.e. new PDF files of certain report types that require logo stamping.

# Initialisation
REMOTE_DIR="/home/pdfdata"
REMOTE_DIR_SHAREDDATA="/home/shareddata"

# Establish mount to remote JDE enterprise server (AIX) system for JDE Print Queue access/monitoring 
umount $REMOTE_DIR
DYNCMD="sshfs -o reconnect -C -o workaround=all -o ServerAliveInterval=30 -o Ciphers=arcfour  -o cache=no -o password_stdin ${SSHFS_USER}@${SSHFS_HOST}:${DIR_JDEPDF} ${REMOTE_DIR}"  
echo $SSHFS_PWD | $DYNCMD
if [ $? -ne 0 ]
then 
	echo
	echo "--------- ERROR ------------"
	echo "Problem mounting remote JDE PDF (Print Queue) directory to monitor"
	echo "Expecting 3 docker -e arguments for User, Pwd and Target Host:Directory"
	echo "Re-run Docker command and provide remote SSHFS User, Pwd and Host:Directory values"
	echo "Tried this command: '${DYNCMD}' but it failed!"
	exit 1
fi

# Establish mount to remote JDE enterprise server (AIX) system to use a common (between Docker containers)
# work area for original (pre-process) PDF file backups and for inter container communication 
umount $REMOTE_DIR_SHAREDDATA
DYNCMD="sshfs -o reconnect -C -o workaround=all -o ServerAliveInterval=30 -o Ciphers=arcfour  -o cache=no -o password_stdin ${SSHFS_USER}@${SSHFS_HOST}:${DIR_SHAREDDATA} ${REMOTE_DIR_SHAREDDATA}"  
echo $SSHFS_PWD | $DYNCMD
if [ $? -ne 0 ]
then 
	echo
	echo "--------- ERROR ------------"
	echo "Problem mounting common (between docker containers) remote AIX shareddata working directory"
	echo "Expecting 3 docker -e arguments for User, Pwd and Target Host:Directory"
	echo "Re-run Docker command and provide remote SSHFS User, Pwd and Host:Directory values"
	echo "Tried this command: '${DYNCMD}' but it failed!"
	exit 1
fi

echo
echo "Remote mounts established handing control over to node monitoring program"
node ./src/pdfmonitor

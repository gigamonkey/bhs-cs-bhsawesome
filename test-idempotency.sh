#!/usr/bin/env bash

set -euo pipefail

# The explicit config matters: discovery is by file extension, and the .xml
# temp files would otherwise not get the .ptx config.
xml-format -c .xml-formats/ptx.json "$1" > first.xml
xml-format -q -c .xml-formats/ptx.json first.xml > second.xml
sum1=$(shasum first.xml | cut -c -40)
sum2=$(shasum second.xml | cut -c -40)

if [ "$sum1" != "$sum2" ]; then
    echo "$1"
    exit 1
else
    exit 0
fi

#!/bin/bash

cd /tmp

svn export --force https://linklayer.ca/svn/ecoutu/chrome/trunk/torrent
zip -r torrent torrent

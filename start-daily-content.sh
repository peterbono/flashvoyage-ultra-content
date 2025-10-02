#!/bin/bash
cd /Users/floriangouloubi/Documents/perso/flashvoyage
node ultra-specialized-content-generator.js &
sleep 5
node fixed-auto-publisher.js

#! /usr/bin/env bash
set -u

# Wait for container to come up
while [ $(docker inspect --format "{{json .State.Health.Status }}" "single-pg-pool-postgres") != "\"healthy\"" ]; do printf "."; sleep 1; done; printf " \e[32mready\n";

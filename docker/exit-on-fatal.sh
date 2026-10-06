#!/bin/sh
# supervisor event listener (PROCESS_STATE_FATAL): when nginx or the API keeps failing, stop the container
# so the orchestrator restarts it. The backup agent failing never takes the app down with it.
# Protocol: READY, then per event a header line (… len:N), N bytes of payload, and RESULT 2\nOK.
printf 'READY\n'
while read -r header; do
  len=${header##*len:}
  payload=$(head -c "$len")
  case " $payload " in
    *" processname:api "* | *" processname:nginx "*) kill -TERM 1 ;;
  esac
  printf 'RESULT 2\nOK'
  printf 'READY\n'
done

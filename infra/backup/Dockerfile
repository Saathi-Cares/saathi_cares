FROM alpine:3.24
RUN apk add --no-cache postgresql16-client restic bash curl tzdata jq coreutils \
 && restic version && pg_dump --version
ENV TZ=Asia/Kolkata
COPY backup.sh restore-test.sh notify.sh entrypoint.sh /usr/local/bin/
COPY crontab /etc/crontabs/root
RUN chmod +x /usr/local/bin/*.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

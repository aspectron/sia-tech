# Installation instructions

NOTE: You may require python and build-essential aptitude packages.


- Install MongoDb and NodeJs:
```
cd ~
sudo apt-get install mongodb
wget https://nodejs.org/dist/v6.2.1/node-v6.2.1-linux-x64.tar.xz
tar xf node-v6.2.1-linux-x64.tar.xz
rm node-v6.2.1-linux-x64.tar.xz
ln -s node-v6.2.1-linux-x64.tar.xz node
echo -e "\n\nPATH=\"$HOME/node/bin:$PATH\"\n\n" >> ~/.profile
```

- Re-login, run `node -v` to see if node has been added to the path properly.  You should see a version string.


- Clone `sia-tech` repo:

```
mkdir releases
cd releases
git clone http://github.com/aspectron/sia-tech
cd sia-tech/config
cp sia-tech.local.conf.example sia-tech.local.conf
cd ..
npm install
```

- Configure upstart: edit `sia-tech.conf` (`sudo nano /etc/init/sia-tech.conf`) and dump the following content in there (replacing `/home/user` with appropriate user folder):

```
# this should live in /etc/init
description "SIA-TECH"

# start process on system startup
start on filesystem
stop on shutdown

# Automatically Respawn:
respawn
respawn limit 20 5

script
cd /home/user/releases/sia-tech
exec ../node/bin/node run sia-tech
end script

```
(original instructions - https://github.com/aspectron/iris-app#deploying-as-ubuntu-upstart-service)

- Configure NGINX proxy.  Edit `/etc/nginx/sites-available/sia-tech` to contain the following content (replace `/home/user` with appropriate user folder), then symlink the file in `/etc/nginx/sites-enabled/sia-tech`

```

server {
        listen 80;
        server_name     sia.tech www.sia.tech;

        # disallow request body size larger than 2mb (change this if your app supports file upload to maximum file size!)
        client_max_body_size 2m;

        # root folder where http content resides
        root /home/user/releases/sia-tech/http/;

        # static folders relative to the root folder        
        location /assets/ { }
        location /img/ { }
        location /css/ { }
        location /scripts/ { }

        location / {
                proxy_set_header X-Real-IP $remote_addr;
                # specify 127.0.0.1 ip and port of your application
                proxy_pass http://127.0.0.1:8888/;
        }

}
```
(original instructions can be found here - https://github.com/aspectron/iris-app#using-nginx-as-a-proxy)

You should be good to go. Start / restart all services:

```
sudo start sia-tech
sudo service nginx restart
cd ~/releases/sia-tech
tail -f logs/sia-tech.log
```

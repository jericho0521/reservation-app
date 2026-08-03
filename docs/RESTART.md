## Server Restart Checklist

After reboot:

```bash
docker ps
sudo systemctl status cloudflared
curl -i http://localhost:8000
curl -i https://supabase.jerichofoong.com/auth/v1/health
```
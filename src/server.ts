import 'dotenv/config';
import { app } from './app';

const PORT = parseInt(process.env.PORT ?? '4000', 10);

app.listen(PORT, () => {
  console.log(`[server] Code Heaven Studio API running on port ${PORT}`);
});

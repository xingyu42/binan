import { Router } from 'express';
import {
  getPrice,
  getAppLog,
  getErrorLog,
  getUsers,
  getPositions
} from '../controllers/apiController.js';

const router = Router();

router.get('/price', getPrice);
router.get('/appLog', getAppLog);
router.get('/errorLog', getErrorLog);
router.get('/users', getUsers);
router.get('/positions', getPositions);

router.get('*', (req, res) => {
  // 处理 其他的api 请求
  res.send('Hello from Node.js API');
});

export default router;

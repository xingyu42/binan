import { getPositionRisk, getAccountData, getPositionSideDual } from '../services/binanceContractService.js';
import fs from 'node:fs';
import { errorLogger } from '../utils/Logger.js';

async function getAccountPosition() {
  let res = await getAccountData()
  let allPositions = res.positions
  return allPositions.filter((item)=>{
    return Math.abs(item.positionAmt) > 0
  }) // 仓位
}

async function getPrice(req, res) {
  try {
    const data = await getAccountPosition()
    res.send(data)
  } catch (error) {
    errorLogger('Error fetching market data:', error);
    res.status(500).send('An error occurred while fetching market data');
  }
}

async function getErrorLog (req, res) {
  fs.readFile('./logs/error.log', (err, data) => {
    if (err) {
      errorLogger('读取错误日志文件失败', err);
      return res.status(500).json({
        error: '无法读取错误日志文件',
        details: err.message,
        code: err.code
      });
    }
    res.send(data.toString())
  });
}

async function getAppLog (req, res) {
  fs.readFile('./logs/app.log', (err, data) => {
    if (err) {
      errorLogger('读取应用日志文件失败', err);
      return res.status(500).json({
        error: '无法读取应用日志文件',
        details: err.message,
        code: err.code
      });
    }
    res.send(data.toString())
  });
}

async function getUsers(req, res) {
  try {
    const data = await getAccountData()
    res.send(data)
  } catch (error) {
    errorLogger('Error fetching market data:', error);
    res.status(500).send('An error occurred while fetching market data');
  }
}

async function getPositions(req, res) {
  try {
    const data = await getAccountPosition()
    res.send(data)
  } catch (error) {
    errorLogger('Error fetching market data:', error);
    res.status(500).send('An error occurred while fetching market data');
  }
}

export {
  getPrice,
  getErrorLog,
  getPositions,
  getUsers,
  getAppLog
};

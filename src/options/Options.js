/*global chrome*/

import React, { useState, useEffect } from "react";
import styles from "./Options.css";
import { DesktopDatePicker } from "@mui/x-date-pickers/DesktopDatePicker";
import {
  Backdrop,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const today = new Date();
const currentMonth = MONTHS[today.getMonth()];
const currentDay = getDay(today);

const userTabsName = [
  {
    Timesheet: {
      Forms: [
        {
          displayName: "Log Timesheet",
        },
        {
          displayName: "Log Timesheet Approval",
        },
      ],
    },
  },
];

// const DOMAIN = window.location.protocol + '//' + window.location.hostname;
function App() {
  const [_projects, setProjects] = useState([]);
  const [_tasks, setTasks] = useState([]);
  const [_user, setUser] = useState("");
  const [_project, pickProject] = useState("");
  const [_task, pickTask] = useState("");
  const [_preMonth, setPreMonth] = useState(0);
  const [_currentPickDate, setCurrentPickDate] = useState(new Date());
  const [_startWorkingDate, setStartWorkingDate] = useState("");
  const [_tabs, setTabs] = useState({});
  const [_loading, setLoading] = useState(true);
  const [CSRF_TOKEN, setToken] = useState(
    localStorage.getItem("CSRF_TOKEN") ?? ""
  );
  const [_shitDays, setShitdays] = useState({
    needAttendance: {},
    needLog: {},
  });

  function getCookies(domain, callback) {
    chrome.cookies.get({ url: domain, name: "CSRF_TOKEN" }, function (cookie) {
      if (callback) {
        callback(cookie.value);
      }
    });
  }

  useEffect(() => {
    if (!CSRF_TOKEN) {
      getCookies("https://people.zoho.com", function (CSRF_TOKEN) {
        CSRF_TOKEN && setToken(CSRF_TOKEN);
        localStorage.setItem("CSRF_TOKEN", CSRF_TOKEN);
        if (!CSRF_TOKEN) {
          getCookies("https://people.smartosc.com", function (CSRF_TOKEN) {
            CSRF_TOKEN && setToken(CSRF_TOKEN);
            localStorage.getItem("CSRF_TOKEN", CSRF_TOKEN);
          });
        }
      });
    }

    const getInitTab = async () => {
      const initTabs = await initPeopleZoho(CSRF_TOKEN);
      setTabs(initTabs);
    };

    getInitTab();
    setLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    const getInitInfoUser = async () => {
      const { tasks, projects, userId } = await fetchTasksAndProjects(
        CSRF_TOKEN
      );
      const { beginningDate } = await fetchWorkingInformation(
        CSRF_TOKEN,
        userId
      );
      setStartWorkingDate(new Date(beginningDate));
      setUser(userId);
      setProjects(projects);
      setTasks(tasks);
      //Set default project and task
      pickProject(projects[0].Id);
      pickTask(tasks[13].Id);
      init({
        setShitdays,
        CSRF_TOKEN,
        beginningDate,
      });
    };
    getInitInfoUser();
  }, [_tabs]);

  useEffect(() => {
    if (CSRF_TOKEN && _tabs && _startWorkingDate) {
      setLoading(true);
      init({
        setShitdays,
        CSRF_TOKEN,
        _startWorkingDate,
      });
    }
  }, [_preMonth]);
  const handleProjectChange = (e) => {
    pickProject(e.target.value);
  };
  const handleTaskChange = (e) => {
    pickTask(e.target.value);
  };

  const handleChangeDateLogTime = (e) => {
    const currentDate = new Date();
    const pickDate = new Date(e);
    const currentYear = currentDate.getFullYear();
    const pickYear = pickDate.getFullYear();
    const diffYear = currentYear - pickYear;
    const diffMonth = currentDate.getMonth() - pickDate.getMonth();
    const preMonth = diffYear > 0 ? diffYear * diffMonth : diffMonth;
    setCurrentPickDate(e);
    setPreMonth(preMonth);
  };

  const handleLog = async () => {
    setLoading(true);
    const logTimeSheetPromises = [];
    for (const day in _shitDays.needLog) {
      const body = {
        projectId: _project,
        taskId: _task,
        userId: _user,
        date: day,
        hour: _shitDays.needLog[day],
      };
      logTimeSheetPromises.push(logTimeSheet(CSRF_TOKEN, body));
    }
    await Promise.all(logTimeSheetPromises);
    await init({
      setShitdays,
      CSRF_TOKEN,
      _startWorkingDate,
    });
    alert("Done");
  };

  async function init({ setShitdays, CSRF_TOKEN, beginningDate }) {
    const shitDays = await getShitDays(CSRF_TOKEN, beginningDate);
    setShitdays(shitDays);
    setLoading(false);
  }

  async function initPeopleZoho(CSRF_TOKEN) {
    const response = await fetch(
      "https://people.zoho.com/hrportal1524046581683/hashAction.zp",
      {
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: `MODE=INIT_PEOPLE&conreqcsr=${CSRF_TOKEN}`,
        method: "POST",
      }
    );
    const { userTabs } = await response.json();
    return userTabs;
  }

  // API
  async function fetchAttendance(CSRF_TOKEN) {
    const response = await fetch(
      "https://people.zoho.com/hrportal1524046581683/AttendanceViewAction.zp",
      {
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: `mode=getAttList&conreqcsr=${CSRF_TOKEN}&loadToday=false&view=month&preMonth=${_preMonth}`,
        method: "POST",
      }
    );
    const { dayList } = await response.json();
    const dayAndTime = {};

    for (const index in dayList) {
      const day = dayList[index];
      if (day.status.includes("Weekend")) continue;
      dayAndTime[day.ldate] = parseTime(day.tHrs);
    }
    return dayAndTime;
  }

  async function fetchWorkingInformation(CSRF_TOKEN, userId) {
    const response = await fetch(
      "https://people.zoho.com/hrportal1524046581683/ssAction.zp",
      {
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: `MODE=INIT_SELFSERVICE&userId=${userId}&conreqcsr=${CSRF_TOKEN}`,
        method: "POST",
      }
    );
    const {
      singleRecord: {
        message: {
          recordDetails: [
            ,
            {
              column1: [, , , , , , , { componentValue }],
            },
          ],
        },
      },
    } = await response.json();

    return {
      beginningDate: componentValue,
    };
  }

  async function fetchTasksAndProjects(CSRF_TOKEN) {
    const pcIdLogTimeSheet = getFormIdTimesheetForm(
      _tabs,
      "Log Timesheet"
    ).pcId;
    const response = await fetch(
      "https://people.zoho.com/hrportal1524046581683/formAction.zp",
      {
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: `formId=${pcIdLogTimeSheet}&mode=getFormComponents&subMode=ADD&conreqcsr=${CSRF_TOKEN}`,
        method: "POST",
      }
    );
    const {
      message: {
        formComponentDetails: [
          ,
          {
            column1: [, , { Options: Projects }, , { Options: Tasks }],
          },
          {
            column1: [
              {
                AddOptions: [{ Id: userId }],
              },
              ,
              ,
            ],
          },
        ],
      },
    } = await response.json();

    return {
      userId,
      tasks: Tasks,
      projects: Projects,
    };
  }
  async function getLoggedDay(CSRF_TOKEN, beginningDate) {
    const pcIdLogTimeSheet = getFormIdTimesheetForm(
      _tabs,
      "Log Timesheet Approval"
    ).pcId;
    const viewId = sumStrings(pcIdLogTimeSheet, "2");
    const response = await fetch(
      "https://people.zoho.com/hrportal1524046581683/viewAction.zp",
      {
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: `mode=fetchRecords&formId=${pcIdLogTimeSheet}&viewId=${viewId}&isOnload=true&typeOfView=mydep&startInd=1&limit=${dayDiff(
          beginningDate ?? _startWorkingDate
        )}&conreqcsr=${CSRF_TOKEN}`,
        method: "POST",
      }
    );
    const {
      recordDetails: {
        message: { recordDetails },
      },
    } = await response.json();

    // status = 1 (đã approval) status = -1 (pending approval)
    return recordDetails
      .filter(
        (record) => record.approvalStatus === 1 || record.approvalStatus === -1
      )
      .map((record) => record.fieldDetails[1]);
    // .filter((day) => day.includes(currentMonth));
  }

  async function getShitDays(CSRF_TOKEN, beginningDate) {
    const needLog = {};
    const needAttendance = {};
    const attendance = await fetchAttendance(CSRF_TOKEN);
    const loggedDays = await getLoggedDay(CSRF_TOKEN, beginningDate);
    loggedDays.forEach((loggedDay) => delete attendance[loggedDay]);

    for (const remainDay in { ...attendance }) {
      if (new Date(remainDay).getTime() < new Date(currentDay).getTime()) {
        if (attendance[remainDay] < 6) {
          needAttendance[remainDay] = attendance[remainDay];
        } else {
          needLog[remainDay] = attendance[remainDay];
        }
      } else {
        delete attendance[remainDay];
      }
    }

    return { needLog, needAttendance };
  }

  async function logTimeSheet(CSRF_TOKEN, body) {
    // Date:  04-Jul-2022
    const { projectId, taskId, userId, hour, date } = body;
    await fetch(
      "https://people.zoho.com/hrportal1524046581683/addUpdateRecord.zp",
      {
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: `isPicklistIdEnabled=true&loginUserZUID=778172696&Task=["${taskId}"]&Timesheet_Hours=["${hour}"]&Project1=["${projectId}"]&Work_location=412762000158026890&Date=${date}&Task_Description=[""]&zp_tableName=t_412762000158024844&conreqcsr=${CSRF_TOKEN}&zp_formId=412762000158024844&zp_mode=addRecord&isDraft=false&isResubmit=false&Related_Users=${userId}`,
        method: "POST",
      }
    );
  }

  return (
    <div
      className="App"
      style={{
        marginLeft: 30,
        marginRight: 30,
      }}
    >
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <h2 className={styles.appTitle}>Timesheet</h2>
        <div
          className={styles.projectSelectContainer}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {/* <Backdrop
            sx={{ color: "#fff", zIndex: (theme) => theme.zIndex.drawer + 1 }}
            open={_loading}
          >
            <CircularProgress color="inherit" />
          </Backdrop> */}
          <DesktopDatePicker
            views={["year", "month"]}
            label="Month"
            minDate={_startWorkingDate}
            maxDate={new Date()}
            inputFormat="MM/YYYY"
            value={_currentPickDate}
            onChange={handleChangeDateLogTime}
            renderInput={(params) => <TextField fullWidth {...params} />}
          />

          <FormControl
            fullWidth
            style={{
              maxHeight: "59px",
              margin: "10px 0",
            }}
          >
            <InputLabel id="Project" className={styles.labelTitle}>
              Project
            </InputLabel>
            <Select
              fullWidth
              labelId="Project"
              id="Project-select"
              value={_project}
              label="Project"
              onChange={handleProjectChange}
              className={styles.selectContainer}
              style={{
                maxHeight: "59px",
              }}
            >
              {_projects.map((project) => (
                <MenuItem value={project.Id}>
                  <p dangerouslySetInnerHTML={{ __html: project.Value }} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel id="Task" className={styles.labelTitle}>
              Task
            </InputLabel>
            <Select
              fullWidth
              labelId="Task"
              id="Task-select"
              value={_task}
              label="Task"
              onChange={handleTaskChange}
              className={styles.selectContainer}
              style={{
                maxHeight: "59px",
              }}
            >
              {_tasks.map((task) => (
                <MenuItem value={task.Id}>
                  <p dangerouslySetInnerHTML={{ __html: task.Value }} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </div>
        <div className={styles.taskSelectContainer}></div>
        <div className={styles.shitDayContainer}>
          <h3>Các ngày cần log timesheet:</h3>
          <ol>
            {Object.keys(_shitDays.needLog).map((day) => (
              <li key={day}>
                {day}: {_shitDays.needLog[day]}h
              </li>
            ))}
          </ol>
          <Button
            disabled={Object.keys(_shitDays.needLog).length === 0}
            onClick={handleLog}
            className={styles.logButton}
            variant="outlined"
          >
            Log
          </Button>
        </div>
        <div className={styles.attendanceDayContainer}>
          <h3>Các ngày cần xin attendance:</h3>
          <ol>
            {Object.keys(_shitDays.needAttendance).map((day) => (
              <li key={day}>
                {day}: {_shitDays.needAttendance[day]}h
              </li>
            ))}
          </ol>
        </div>
      </LocalizationProvider>
    </div>
  );
}

//////////////////////////////////////////////////////

// Helper
function roundHalf(num) {
  return Math.round(num * 2) / 2;
}

function parseTime(time) {
  const [hour, minute] = time.split(":");
  return roundHalf(Number(hour) + Number(minute) / 60);
}

function getDay(date) {
  let d = date.toISOString().split("T")[0].split("-");
  const m = Number(d[1]) - 1;
  d[1] = MONTHS[m];
  [d[0], d[2]] = [d[2], d[0]];
  return d.join("-");
}
/////////////////////////////////////////////////////

function getFormIdTimesheetForm(tabs, keyFormDisplay) {
  return (tabs ?? [])
    .find((tab) => tab.name === "Timesheet")
    .subtabs[0].formArr.find((form) => form.displayName === keyFormDisplay);
}

/**
 * Sum two big numbers given as strings.
 *
 * @param {string} a
 * @param {string} b
 * @return {string}
 */
function sumStrings(a, b) {
  var zrx = /^0+/; // remove leading zeros
  a = a.replace(zrx, "").split("").reverse();
  b = b.replace(zrx, "").split("").reverse();

  var result = [],
    max = Math.max(a.length, b.length);
  for (var memo = 0, i = 0; i < max; i++) {
    var res = parseInt(a[i] || 0) + parseInt(b[i] || 0) + memo;
    result[i] = res % 10;
    memo = (res - result[i]) / 10;
  }

  if (memo) {
    result.push(memo);
  }

  return result.reverse().join("");
}

/**
 * Get day diff between two date.
 *
 * @param {string} from
 * @param {string} to
 * @return {number} result
 */
function dayDiff(from, to = new Date()) {
  return Math.floor((Date.parse(to) - Date.parse(from)) / 86400000);
}

export default App;

import { useEffect, useMemo, useState, type ReactNode } from "react";
import "./Dashboard.css";

const API_URL = "http://localhost:8000";

type Extraction = {
  tasks: string[];
  events: string[];
  reminders: string[];
  people: string[];
  ideas: string[];
  uncertainties: string[];
};

type BrainDump = {
  id: string;
  title: string | null;
  transcript: string | null;
  extraction: Extraction | null;
  created_at: string;
};

type User = {
  id: string;
  name: string;
  created_at: string;
};

type DashboardProps = {
  onNewBrainDump: () => void;
};

function getUserId() {
  return localStorage.getItem("unbox_user_id");
}

function authHeaders(): HeadersInit {
  const userId = getUserId();

  return userId
    ? {
      "X-User-ID": userId,
    }
    : {};
}

function formatDate(dateString: string) {
  const date = new Date(dateString);

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatDateTime(dateString: string) {
  const date = new Date(dateString);

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function Dashboard({ onNewBrainDump }: DashboardProps) {
  const [completedEvent, setCompletedEvent] = useState<string | null>(null);
  const [showAllDumps, setShowAllDumps] = useState(false);
  const [openReminderMenu, setOpenReminderMenu] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [brainDumps, setBrainDumps] = useState<BrainDump[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);
        setError("");

        const userResponse = await fetch(`${API_URL}/users/me`, {
          headers: authHeaders(),
        });

        if (!userResponse.ok) {
          throw new Error("Could not load user");
        }

        const userData = await userResponse.json();
        setUser(userData);

        const dumpsResponse = await fetch(`${API_URL}/brain-dumps`, {
          headers: authHeaders(),
        });

        if (!dumpsResponse.ok) {
          throw new Error("Could not load brain dumps");
        }

        const dumpsData = await dumpsResponse.json();
        setBrainDumps(dumpsData);
      } catch (err) {
        console.error(err);
        setError("Unable to load your dashboard.");
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);



  const handleDeleteReminder = async (
    dumpId: string,
    reminderIndex: number
  ) => {
    try {
      const userId = localStorage.getItem("unbox_user_id");

      const response = await fetch(
        `${API_URL}/brain-dumps/${dumpId}/reminders/${reminderIndex}`,
        {
          method: "DELETE",
          headers: {
            "X-User-ID": userId ?? "",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to delete reminder");
      }

      setBrainDumps((current) =>
        current.map((dump) => {
          if (dump.id !== dumpId || !dump.extraction) {
            return dump;
          }

          const reminders = [...(dump.extraction.reminders ?? [])];
          reminders.splice(reminderIndex, 1);

          return {
            ...dump,
            extraction: {
              ...dump.extraction,
              reminders,
            },
          };
        })
      );
    } catch (error) {
      console.error(error);
    }
  };

  const allTasks = useMemo(
    () =>
      brainDumps.flatMap((dump) =>
        (dump.extraction?.tasks ?? []).map((task) => ({
          text: task,
          dumpId: dump.id,
        })),
      ),
    [brainDumps],
  );

  const allEvents = useMemo(
    () =>
      brainDumps.flatMap((dump) =>
        (dump.extraction?.events ?? []).map((event, eventIndex) => ({
          text: event,
          dumpId: dump.id,
          eventIndex,
        })),
      ),
    [brainDumps],
  );

  const handleCompleteEvent = (event: {
    dumpId: string;
    eventIndex: number;
  }) => {
    const key = `${event.dumpId}-${event.eventIndex}`;

    setCompletedEvent(key);

    setTimeout(() => {
      handleDeleteEvent(event.dumpId, event.eventIndex);
    }, 700);
  };
  const handleDeleteEvent = async (
    dumpId: string,
    eventIndex: number,
  ) => {
    try {
      const userId = localStorage.getItem("unbox_user_id");

      const response = await fetch(
        `${API_URL}/brain-dumps/${dumpId}/events/${eventIndex}`,
        {
          method: "DELETE",
          headers: {
            "X-User-ID": userId ?? "",
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to delete event");
      }

      setBrainDumps((current) =>
        current.map((dump) => {
          if (dump.id !== dumpId || !dump.extraction) {
            return dump;
          }

          const events = [...(dump.extraction.events ?? [])];
          events.splice(eventIndex, 1);

          return {
            ...dump,
            extraction: {
              ...dump.extraction,
              events,
            },
          };
        }),
      );
    } catch (error) {
      console.error(error);
      setCompletedEvent(null);
    }
  };

  const allReminders = useMemo(
    () =>
      brainDumps.flatMap((dump) =>
        (dump.extraction?.reminders ?? []).map((text, reminderIndex) => ({
          text,
          dumpId: dump.id,
          reminderIndex,
        })),
      ),
    [brainDumps],
  );

  const allPeople = useMemo(
    () =>
      Array.from(
        new Set(
          brainDumps.flatMap((dump) => dump.extraction?.people ?? []),
        ),
      ),
    [brainDumps],
  );

  const allIdeas = useMemo(
    () =>
      brainDumps.flatMap((dump) =>
        (dump.extraction?.ideas ?? []).map((idea) => ({
          text: idea,
          dumpId: dump.id,
        })),
      ),
    [brainDumps],
  );

  const totalUncertainties = useMemo(
    () =>
      brainDumps.reduce(
        (total, dump) =>
          total + (dump.extraction?.uncertainties?.length ?? 0),
        0,
      ),
    [brainDumps],
  );

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-loading">Loading your workspace...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-loading">
          <p>{error}</p>
          <button
            className="dashboard-primary-button"
            onClick={onNewBrainDump}
          >
            + New brain dump
          </button>
        </div>
      </div>
    );
  }

  const displayName = user?.name || "there";

  return (
    <div className="dashboard-page">
      {/* Ambient Background */}
      <div className="dashboard-ambient" aria-hidden="true">
        <div className="ambient ambient-top" />
        <div className="ambient ambient-right" />
        <div className="ambient ambient-left" />
        <div className="ambient ambient-bottom" />
      </div>

      {/* Main Workspace */}
      <div className="dashboard-shell">
        {/* Header */}
        <header className="dashboard-header">
          <div className="dashboard-brand">
            <h1>Unbox</h1>

            <span className="sync-badge">
              <span className="status-dot" />
              SYNC READY · v2.4
            </span>
          </div>

          <div className="dashboard-search">
            <span className="material-symbols-outlined">search</span>

            <input
              type="text"
              placeholder="Search thoughts, tasks, entities..."
            />

            <kbd>⌘K</kbd>
          </div>

          <div className="dashboard-header-actions">
            <button
              className="dashboard-primary-button"
              onClick={onNewBrainDump}
              type="button"
            >
              <span className="material-symbols-outlined">mic</span>
              <span>+ New brain dump</span>
            </button>

            <div className="header-icons">
              <button
                className="header-icon-button notification-button"
                title="Notifications"
                type="button"
              >
                <span className="material-symbols-outlined">
                  notifications
                </span>
                <span className="notification-dot" />
              </button>

              <button
                className="header-icon-button active"
                title="Auto Synthesize"
                type="button"
              >
                <span className="material-symbols-outlined">
                  auto_awesome
                </span>
              </button>
            </div>
          </div>
        </header>

        <main className="dashboard-main">
          <div className="dashboard-content">
            {/* Welcome */}
            <section className="dashboard-welcome">
              <div>
                <div className="welcome-meta">
                  <span>
                    {formatDate(new Date().toISOString())}
                  </span>

                  <span>•</span>

                  <span className="ready-status">
                    <span className="status-dot" />
                    READY
                  </span>
                </div>

                <h2>Good evening, {displayName}</h2>

                <p>
                  Your mental buffers are clear. Here is what has been
                  captured.
                </p>
              </div>

              <span className="overview-badge">
                <span>✦</span>
                Overview Mode
              </span>
            </section>

            {/* Quick Voice Capture */}
            <section className="voice-hero">
              <div className="voice-hero-glow voice-glow-right" />
              <div className="voice-hero-glow voice-glow-left" />

              <div className="voice-hero-content">
                <div className="voice-copy">
                  <div className="capture-label">
                    <span className="material-symbols-outlined">
                      graphic_eq
                    </span>
                    Quick Voice Capture
                  </div>

                  <h3>
                    What’s on your mind? Don’t organize it. Just say it.
                  </h3>

                  <p>
                    Unbox turns spontaneous natural speech into structured
                    tasks, calendar appointments, and contextual notes
                    without manual sorting.
                  </p>

                  <div className="microphone-status">
                    <div className="waveform">
                      <span />
                      <span />
                      <span className="active" />
                      <span className="active-tall" />
                      <span className="active" />
                      <span />
                      <span />
                      <span className="active-tall" />
                      <span />
                      <span />
                      <span className="active" />
                      <span />
                    </div>

                    <span>Microphone active</span>
                  </div>
                </div>

                <div className="voice-action">
                  <button
                    className="voice-button pulse-glow"
                    onClick={onNewBrainDump}
                    type="button"
                  >
                    <span className="material-symbols-outlined">
                      mic
                    </span>
                  </button>

                  <p>
                    Click to record or press{" "}
                    <kbd>Space</kbd>
                  </p>
                </div>
              </div>
            </section>

            {/* Counters */}
            <section className="counter-grid">
              <DashboardCounter
                label="Tasks"
                icon="check_circle"
                value={allTasks.length}
                suffix="open"
                footer={
                  allTasks.length
                    ? `${allTasks.length} captured`
                    : "Nothing captured"
                }
              />

              <DashboardCounter
                label="Events"
                icon="event"
                value={allEvents.length}
                suffix="upcoming"
                footer={
                  allEvents.length
                    ? "AI extracted"
                    : "Nothing captured"
                }
              />

              <DashboardCounter
                label="Reminders"
                icon="alarm"
                value={allReminders.length}
                suffix="captured"
                footer={
                  allReminders.length
                    ? "AI anchored"
                    : "Nothing captured"
                }
              />

              <DashboardCounter
                label="People"
                icon="group"
                value={allPeople.length}
                suffix="mentioned"
                footer={
                  allPeople.length
                    ? allPeople.slice(0, 3).join(", ")
                    : "None mentioned"
                }
                accent
              />

              <DashboardCounter
                label="Ideas"
                icon="lightbulb"
                value={allIdeas.length}
                suffix="saved"
                footer={
                  allIdeas.length
                    ? "Unfiled insights"
                    : "Nothing captured"
                }
                success
              />
            </section>

            {/* Bento Grid */}
            <div className="dashboard-bento">
              {/* Left */}
              <div className="dashboard-column">
                {/* Tasks */}
                <DashboardCard>
                  <CardHeader
                    icon="check_circle"
                    title="Actionable Tasks"
                    badge="✦ AI extracted"
                  />

                  <div className="task-list">
                    {allTasks.length === 0 ? (
                      <EmptyState text="No tasks extracted yet." />
                    ) : (
                      allTasks.slice(0, 5).map((task, index) => (
                        <div className="task-item" key={`${task.dumpId}-${index}`}>
                          <input type="checkbox" />

                          <div className="task-content">
                            <div className="task-title-row">
                              <span className="task-title">
                                {task.text}
                              </span>

                              <span className="priority-normal">
                                AI
                              </span>
                            </div>

                            <div className="task-meta">
                              <span>From voice dump</span>
                              <span>•</span>
                              <span>Captured</span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="card-footer">
                    <span>
                      Tasks automatically sync to designated lists upon
                      confirmation
                    </span>

                    <button type="button">+ Add manual task</button>
                  </div>
                </DashboardCard>

                {/* Recent Brain Dumps */}
                <DashboardCard>
                  <CardHeader
                    icon="graphic_eq"
                    title="Recent Brain Dumps"
                  />

                  <div className="dump-list">
                    {brainDumps.length === 0 ? (
                      <EmptyState text="No brain dumps yet." />
                    ) : (
                      (showAllDumps ? brainDumps : brainDumps.slice(0, 3)).map((dump) => {
                        const extraction = dump.extraction;

                        const taskCount =
                          extraction?.tasks?.length ?? 0;
                        const reminderCount =
                          extraction?.reminders?.length ?? 0;
                        const eventCount =
                          extraction?.events?.length ?? 0;
                        const peopleCount =
                          extraction?.people?.length ?? 0;
                        const ideaCount =
                          extraction?.ideas?.length ?? 0;

                        const reviewed = Boolean(extraction);



                        return (
                          <div className="dump-item" key={dump.id}>
                            <div className="dump-top">
                              <div className="dump-date">
                                <span className="dump-dot" />

                                <span>
                                  {formatDateTime(dump.created_at)}
                                </span>
                              </div>

                              <span
                                className={
                                  reviewed
                                    ? "reviewed-badge"
                                    : "review-badge"
                                }
                              >
                                {reviewed
                                  ? "Reviewed"
                                  : "Needs review"}
                              </span>
                            </div>

                            <p className="dump-transcript">
                              “
                              {dump.transcript ||
                                "No transcript available."}
                              ”
                            </p>

                            <div className="dump-tags">
                              {taskCount > 0 && (
                                <span>{taskCount} tasks</span>
                              )}

                              {reminderCount > 0 && (
                                <span>{reminderCount} reminders</span>
                              )}

                              {eventCount > 0 && (
                                <span>{eventCount} events</span>
                              )}

                              {peopleCount > 0 && (
                                <span>{peopleCount} people</span>
                              )}

                              {ideaCount > 0 && (
                                <span>{ideaCount} ideas</span>
                              )}

                              {extraction &&
                                extraction.uncertainties.length > 0 && (
                                  <span>
                                    {extraction.uncertainties.length} unclear
                                  </span>
                                )}

                              <span className="organized-label">
                                <span className="material-symbols-outlined">
                                  done_all
                                </span>
                                {reviewed
                                  ? "Organized"
                                  : "Needs review"}
                              </span>
                            </div>
                          </div>
                        );


                      })

                    )}
                    {
                      brainDumps.length > 3 && !showAllDumps && (
                        <div className="recent-dumps-overlay">
                          <button
                            type="button"
                            onClick={() => setShowAllDumps(true)}
                          >
                            View all dumps
                          </button>
                        </div>
                      )
                    }
                  </div>
                </DashboardCard>
              </div>

              {/* Right */}
              <div className="dashboard-column">
                {/* Events */}
                <DashboardCard>
                  <CardHeader
                    icon="event"
                    title="Events & Meetings"
                    rightText={`${allEvents.length} inferred`}
                  />

                  <div className="event-list">
                    {allEvents.length === 0 ? (
                      <EmptyState text="No events extracted yet." />
                    ) : (
                      allEvents.slice(0, 5).map((event) => (
                        <div
                          className={`event-item ${completedEvent === `${event.dumpId}-${event.eventIndex}`
                            ? "event-completing"
                            : ""
                            }`}
                          key={`${event.dumpId}-${event.eventIndex}`}
                        >
                          <button
                            type="button"
                            className="event-checkbox"
                            onClick={() => handleCompleteEvent(event)}
                            aria-label="Complete event"
                          >
                            <span className="event-checkbox-icon" />
                          </button>
                          <p className="event-text">
                            {event.text}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </DashboardCard>

                {/* Reminders */}
                <DashboardCard>
                  <CardHeader
                    icon="alarm"
                    title="Reminders"
                    badge="✦ AI anchored"
                  />

                  <div className="reminder-list">
                    {allReminders.length === 0 ? (
                      <EmptyState text="No reminders extracted yet." />
                    ) : (
                      allReminders.slice(0, 5).map((reminder, index) => (
                        <div
                          className="reminder-item"
                          key={`${reminder.dumpId}-${index}`}
                        >
                          <div className="reminder-content">
                            <span className="material-symbols-outlined">
                              notifications_active
                            </span>

                            <div>
                              <p>{reminder.text}</p>

                            </div>
                          </div>

                          <div className="reminder-menu-wrapper">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenReminderMenu(
                                  openReminderMenu === `${reminder.dumpId}-${reminder.reminderIndex}`
                                    ? null
                                    : `${reminder.dumpId}-${reminder.reminderIndex}`
                                )
                              }
                              title="Reminder options"
                            >
                              <span className="material-symbols-outlined">
                                more_vert
                              </span>
                            </button>

                            {openReminderMenu ===
                              `${reminder.dumpId}-${reminder.reminderIndex}` && (
                                <div className="reminder-menu">
                                  <button
                                    type="button"
                                    className="delete-reminder-button"
                                    onClick={() => {
                                      handleDeleteReminder(
                                        reminder.dumpId,
                                        reminder.reminderIndex
                                      );
                                      setOpenReminderMenu(null);
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                </DashboardCard>

                {/* People & Ideas */}
                <DashboardCard>
                  <CardHeader
                    icon="bubble_chart"
                    title="People & Ideas"
                    rightText="Extracted entities"
                  />

                  <div className="people-ideas">
                    <div>
                      <span className="subsection-label">
                        People Mentioned
                      </span>

                      <div className="people-list">
                        {allPeople.length === 0 ? (
                          <span className="empty-inline">
                            No people mentioned
                          </span>
                        ) : (
                          allPeople.slice(0, 8).map((person) => (
                            <div
                              className="person-pill"
                              key={person}
                            >
                              <span className="person-avatar">
                                {getInitial(person)}
                              </span>

                              <span>{person}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="subsection-label">
                        Captured Insights
                      </span>

                      <div className="idea-list">
                        {allIdeas.length === 0 ? (
                          <span className="empty-inline">
                            No ideas captured
                          </span>
                        ) : (
                          allIdeas.slice(0, 5).map((idea, index) => (
                            <div
                              className="idea-item"
                              key={`${idea.dumpId}-${index}`}
                            >
                              <span>✦</span>

                              <div>
                                <span>{idea.text}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {totalUncertainties > 0 && (
                      <div className="uncertainty-note">
                        <span className="material-symbols-outlined">
                          help
                        </span>

                        <span>
                          {totalUncertainties} item
                          {totalUncertainties === 1 ? "" : "s"} need
                          clarification.
                        </span>
                      </div>
                    )}
                  </div>
                </DashboardCard>
              </div>
            </div>

            {/* Footer */}
            <footer className="dashboard-footer">
              <div>
                <span className="footer-status-dot" />
                <span>
                  All captures stored privately with local end-to-end
                  encryption.
                </span>
              </div>

              <div>
                <a href="#">Privacy Principles</a>
                <span>•</span>
                <a href="#">Audio Preferences</a>
                <span>•</span>
                <a href="#">Keyboard Shortcuts</a>
              </div>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}

function DashboardCounter({
  label,
  icon,
  value,
  suffix,
  footer,
  accent = false,
  success = false,
}: {
  label: string;
  icon: string;
  value: number;
  suffix: string;
  footer: string;
  accent?: boolean;
  success?: boolean;
}) {
  return (
    <div className="counter-card">
      <div className="counter-header">
        <span>{label}</span>

        <span className="material-symbols-outlined">
          {icon}
        </span>
      </div>

      <div className="counter-value">
        <span>{value}</span>
        <span>{suffix}</span>
      </div>

      <div
        className={`counter-footer ${accent ? "accent" : ""
          } ${success ? "success" : ""}`}
      >
        {accent || success ? "✦ " : ""}
        {footer}
      </div>
    </div>
  );
}

function DashboardCard({
  children,
}: {
  children: ReactNode;
}) {
  return <section className="dashboard-card">{children}</section>;
}

function CardHeader({
  icon,
  title,
  badge,
  rightText,
}: {
  icon: string;
  title: string;
  badge?: string;
  rightText?: string;
}) {
  return (
    <div className="card-header">
      <div className="card-title">
        <span className="material-symbols-outlined">
          {icon}
        </span>

        <h3>{title}</h3>
      </div>

      {badge && <span className="card-badge">{badge}</span>}

      {rightText && (
        <span className="card-right-text">{rightText}</span>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

export default Dashboard;
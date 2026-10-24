from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from backend.app.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def ensure_schema_upgrades(db_engine):
    """
    Ensure newly added columns exist in existing SQLite tables without breaking data.
    """
    with db_engine.connect() as conn:
        try:
            # Check sos_incidents columns
            res = conn.execute(text("PRAGMA table_info(sos_incidents)"))
            existing_cols = {row[1] for row in res.fetchall()}
            if existing_cols:
                if "participant_id" not in existing_cols:
                    conn.execute(text("ALTER TABLE sos_incidents ADD COLUMN participant_id VARCHAR(64)"))
                if "broadcast_id" not in existing_cols:
                    conn.execute(text("ALTER TABLE sos_incidents ADD COLUMN broadcast_id VARCHAR(64)"))
                if "relay_node_id" not in existing_cols:
                    conn.execute(text("ALTER TABLE sos_incidents ADD COLUMN relay_node_id VARCHAR(64)"))
                if "relayed_at" not in existing_cols:
                    conn.execute(text("ALTER TABLE sos_incidents ADD COLUMN relayed_at DATETIME"))
                if "delivery_channel" not in existing_cols:
                    conn.execute(text("ALTER TABLE sos_incidents ADD COLUMN delivery_channel VARCHAR(32) DEFAULT 'INTERNET'"))
                if "acknowledged_by_server_at" not in existing_cols:
                    conn.execute(text("ALTER TABLE sos_incidents ADD COLUMN acknowledged_by_server_at DATETIME"))
                if "acknowledged_by_rescuer_at" not in existing_cols:
                    conn.execute(text("ALTER TABLE sos_incidents ADD COLUMN acknowledged_by_rescuer_at DATETIME"))
                if "rescuer_name" not in existing_cols:
                    conn.execute(text("ALTER TABLE sos_incidents ADD COLUMN rescuer_name VARCHAR(100)"))
                if "is_demo" not in existing_cols:
                    conn.execute(text("ALTER TABLE sos_incidents ADD COLUMN is_demo BOOLEAN DEFAULT 0"))
                # Tag synthetic/test-suite records as demo records so live operational view is clean
                conn.execute(text("""
                    UPDATE sos_incidents
                    SET is_demo = 1
                    WHERE is_demo IS NULL
                       OR id LIKE 'SOS-KL-%'
                       OR id LIKE 'SOS-LIVE-%'
                       OR id LIKE 'SOS-RELAY-%'
                       OR id LIKE 'SOS-HELP-%'
                       OR id LIKE 'SOS-ESC-%'
                       OR id LIKE 'test-%'
                       OR description LIKE 'Testing%'
                       OR description LIKE 'Test %'
                       OR description LIKE 'Mock%'
                       OR description LIKE 'Simulated%'
                """))
                conn.commit()
        except Exception as e:
            # Table might not exist yet before create_all
            pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


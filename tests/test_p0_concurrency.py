"""Barrier-synchronized, independent psql-process race tests on the isolated DB."""
import concurrent.futures
import threading
import unittest
import test_pg_p0 as core
from test_pg_p0 import uid, run, ok, rejected

def together(queries):
    barrier=threading.Barrier(len(queries))
    def worker(sql):
        barrier.wait(timeout=10)
        return run(sql)
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(queries)) as pool:
        return list(pool.map(worker,queries))

class RealRaceContracts(unittest.TestCase):
    def setUp(self):
        core.RealDatabaseContracts.setUp(self)
    def categories(self,n=3):
        return core.RealDatabaseContracts.categories(self,n)
    def entity(self,kind="concept",name="Synthetic concept"):
        return core.RealDatabaseContracts.entity(self,kind,name)

    def test_read_committed_concurrent_two_writer_cycle(self):
        a,b=self.categories(2)
        for _ in range(4):
            # Recreate the same independent table state on every repetition.
            ok("DELETE FROM kg.category_edges;")
            results=together([
                f"INSERT INTO kg.category_edges VALUES('{a}','{b}');",
                f"INSERT INTO kg.category_edges VALUES('{b}','{a}');"
            ])
            self.assertEqual(sum(x.returncode==0 for x in results),1,
                [x.stderr for x in results])
            self.assertEqual(ok("SELECT count(*) FROM kg.category_edges;"),"1")

    def test_read_committed_concurrent_three_edge_cycle(self):
        a,b,c=self.categories()
        for _ in range(4):
            ok("DELETE FROM kg.category_edges;")
            ok(f"INSERT INTO kg.category_edges VALUES('{a}','{b}');")
            results=together([
                f"INSERT INTO kg.category_edges VALUES('{b}','{c}');",
                f"INSERT INTO kg.category_edges VALUES('{c}','{a}');"
            ])
            self.assertEqual(sum(x.returncode==0 for x in results),1,
                [x.stderr for x in results])
            self.assertEqual(ok("SELECT count(*) FROM kg.category_edges;"),"2")

    def test_repeatable_read_writes_fail_closed(self):
        a,b=self.categories(2)
        rejected(f"BEGIN ISOLATION LEVEL REPEATABLE READ;"
                 f"INSERT INTO kg.category_edges VALUES('{a}','{b}'); COMMIT;",
                 "UNSUPPORTED_TAXONOMY_ISOLATION")
        self.assertEqual(ok("SELECT count(*) FROM kg.category_edges;"),"0")

    def test_barrier_synced_publish_compare_and_swap(self):
        helper=core.RealDatabaseContracts("test_01_taxonomy_cycle_blocked")
        entity,rev1=helper.approved_revision()
        _,rev2=helper.approved_revision(entity,
            "Synthetic proof: paper introduced a test idea. Revision two.")
        outcomes=together([
            f"SELECT kg.publish('{entity}','{rev1}',0);",
            f"SELECT kg.publish('{entity}','{rev2}',0);"
        ])
        self.assertEqual(sum(x.returncode==0 for x in outcomes),1,
            [x.stderr for x in outcomes])
        self.assertEqual(ok("SELECT count(*) FROM kg.heads;"),"1")
        self.assertEqual(ok("SELECT count(*) FROM kg.outbox;"),"1")
        self.assertEqual(ok("SELECT count(*) FROM kg.snapshots;"),"1")

if __name__=="__main__":
    unittest.main(verbosity=2)

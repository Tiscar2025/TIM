from typing import Optional, List

from contracts import contract, new_contract
from typing import Optional

import os.path
import hashlib
import sqlite3

new_contract('row', sqlite3.Row)

from timdb.timdbbase import TimDbBase, TimDbException, blocktypes
from timdb.documents import *

class VelpGroups(Documents):

    def create_default_velp_group(self, name: str, owner_group_id: int, default_group_path: str):
        """Creates default velp group for document.

        :param name: Name of the new default velp group.
        :param owner_group_id: The id of the owner group.
        :param default_group_path: Path of new document / velp group
        :return:
        """

        # Create new document and add its ID to VelpGroupTable
        new_group = self.create(default_group_path, owner_group_id)
        new_group_id = new_group.doc_id
        valid_until = None
        cursor = self.db.cursor()
        cursor.execute("""
                      INSERT OR IGNORE INTO
                      VelpGroup(id, name, valid_until, default_group)
                      VALUES (?, ?, ?, ?)
                      """, [new_group_id, name, valid_until, 1]
                       )
        self.db.commit()
        return new_group_id

    def create_velp_group(self, name: str, owner_group_id: int, new_group_path: str, valid_until: Optional[str] = None):
        """Create a velp group

        :param name: Name of the created group.
        :param owner_group_id: The id of the owner group.
        :param new_group_path: Path of new document / velp group
        :param valid_until: How long velp group is valid (None is forever).
        :return:
        """

        # Create new document and add its ID to VelpGroupTable
        new_group = self.create(new_group_path, owner_group_id)
        new_group_id = new_group.doc_id
        cursor = self.db.cursor()
        cursor.execute("""
                      INSERT INTO
                      VelpGroup(id, name, valid_until)
                      VALUES (?, ?, ?)
                      """, [new_group_id, name, valid_until]
                       )
        self.db.commit()
        return new_group_id

    def make_document_a_velp_group(self, name: str, velp_group_id: int, valid_until: Optional[str] = None,
                                   default_group: Optional[bool] = 0):
        """Adds document to VelpGroup table

        :param name: Name of the created group.
        :param velp_group_id: ID of new velp group (and existing document)
        :param valid_until: How long velp group is valid (None is forever)
        :param default_group: Boolean whether velp group should be default or not
        :return:
        """
        cursor = self.db.cursor()

        cursor.execute("""
                      INSERT OR IGNORE INTO
                      VelpGroup(id, name, valid_until, default_group)
                      VALUES (?, ?, ?, ?)
                      """, [velp_group_id, name, valid_until, default_group]
                       )
        self.db.commit()
        return velp_group_id

    def update_velp_group_to_default_velp_group(self, velp_group_id: int):
        """Makes velp group a default velp group in velp group table

        :param velp_group_id: ID of velp group
        :return:
        """
        cursor = self.db.cursor()
        cursor.execute("""
                      UPDATE VelpGroup
                      SET default_group = 1, valid_until = NULL
                      WHERE id = ?
                      """, [velp_group_id]
                       )
        self.db.commit()

    def add_velp_to_group(self, velp_id: int, velp_group_id: int):
        """Adds a velp to a specific group

        :param velp_id: Velp if
        :param velp_group_id: Velp group id
        :return:
        """
        cursor = self.db.cursor()
        cursor.execute("""
                      INSERT OR IGNORE INTO
                      VelpInGroup(velp_group_id, velp_id)
                      VALUES (?, ?)
                      """, [velp_group_id, velp_id]
                       )
        self.db.commit()

    def add_velp_to_groups(self, velp_id: int, velp_group_ids: [int]):
        """Adds a velp to specific groups

        :param velp_id: ID of velp
        :param velp_group_ids: List of velp group IDs
        :return:
        """
        cursor = self.db.cursor()
        for velp_group in velp_group_ids:
            cursor.execute("""
                          INSERT OR IGNORE INTO
                          VelpInGroup(velp_group_id, velp_id)
                          VALUES (?, ?)
                          """, [velp_group, velp_id]
                          )
        self.db.commit()

    def remove_velp_from_group(self, velp_id: int, velp_group_id: int):
        """Removes a velp from a specific group

        :param velp_id: Velp id
        :param velp_group_id: Velp group id
        :return:
        """
        cursor = self.db.cursor()
        cursor.execute("""
                      DELETE
                      FROM VelpInGroup
                      WHERE velp_id = ? AND velp_group_id = ?
                      """, [velp_id, velp_group_id]
                      )
        self.db.commit()

    def remove_velp_from_groups(self, velp_id: int, velp_group_ids: [int]):
        """Removes a velp from specific groups

        :param velp_id: ID of velp
        :param velp_group_ids: List of velp group IDs
        :return:
        """
        print(velp_group_ids)
        cursor = self.db.cursor()
        for velp_group in velp_group_ids:
            cursor.execute("""
                          DELETE
                          FROM VelpInGroup
                          WHERE velp_id = ? AND velp_group_id = ?
                          """, [velp_id, velp_group]
                          )
        self.db.commit()

    def get_velp_group_name(self, velp_group_id: int) -> str:
        cursor = self.db.cursor()
        cursor.execute('SELECT name FROM VelpGroup WHERE id = ?', [velp_group_id])
        result = cursor.fetchone()
        return result[0] if result is not None else None

    def get_groups_for_velp(self, velp_id):
        cursor = self.db.cursor()
        cursor.execute('SELECT velp_group_id AS id FROM VelpInGroup WHERE velp_id = ?', [velp_id])
        result = cursor.fetchall()
        return result

    def is_id_velp_group(self, doc_id: int) -> bool:
        """ Checks whether given document id can also be found from VelpGroup table

        :param doc_id: ID of document
        :return: True if part of VelpGroup table, else False
        """
        cursor = self.db.cursor()
        cursor.execute('SELECT name FROM VelpGroup WHERE id = ?', [doc_id])
        result = cursor.fetchone()
        return True if result is not None else False


    def add_group_to_imported_table(self, user_group: int, doc_id: int, target_type: int, target_id: int,
                                    velp_group_id: int):
        """Adds velp groups to ImportedVelpGroups table for specific document / user group combo

        :param user_group: ID of user group
        :param doc_id: Id of document
        :param target_type: Which kind of area group targets to (0 doc, 1 paragraph, 2 area)
        :param target_id:  ID of target (0 for documents)
        :param velp_group_id: ID of velp group
        :return:
        """
        cursor = self.db.cursor()
        cursor.execute("""
                      INSERT OR IGNORE INTO
                      ImportedVelpGroups(user_group, doc_id, target_type, target_id, velp_group_id)
                      VALUES (?, ?, ?, ?, ?)
                      """, [user_group, doc_id, target_type, target_id, velp_group_id]
                      )
        self.db.commit()

        return


    def get_groups_from_imported_table(self, user_groups: [int], doc_id: int):
        """Gets velp groups from ImportedVelpGroups table for specific document / user group IDs combo

        :param user_groups: List of user group IDs
        :param doc_id: ID of document
        :return:
        """
        cursor = self.db.cursor()
        cursor.execute("""
                      SELECT
                      user_group, doc_id, target_type, target_id, velp_group_id as id
                      FROM ImportedVelpGroups
                      WHERE doc_id = ? AND user_group IN ({})
                      """.format(self.get_sql_template(user_groups)), [doc_id] + user_groups
                      )
        results = self.resultAsDictionary(cursor)
        return results

    def add_groups_to_selection_table(self, velp_groups: dict, doc_id: int, user_id: int):
        """Adds velp groups to VelpGroupSelection table

        :param velp_groups: Velp groups as dictionaries
        :param doc_id: ID of document
        :param user_id: ID of user
        :return:
        """
        cursor = self.db.cursor()
        for velp_group in velp_groups:
            target_type = velp_group['target_type']
            target_id = velp_group['target_id']
            selected = 1
            velp_group_id = velp_group['id']
            cursor.execute("""
                          INSERT OR IGNORE INTO
                          VelpGroupSelection(user_id, doc_id, target_type, target_id, selected, velp_group_id)
                          VALUES (?, ?, ?, ?, ?, ?)
                          """, [user_id, doc_id, target_type, target_id, selected, velp_group_id]
                           )
        self.db.commit()

    def get_groups_from_selection_table(self, doc_id: int, user_id: int):
        """Gets velp groups from VelpGroupSelection table of specific document / user combo

        :param doc_id: ID of document
        :param user_id: ID of user
        :return:
        """
        cursor = self.db.cursor()
        cursor.execute("""
                      SELECT
                      target_type, target_id, velp_group_id as id, selected,
                      DocEntry.name AS location
                      FROM VelpGroupSelection
                      JOIN DocEntry ON DocEntry.id = VelpGroupSelection.velp_group_id
                      WHERE doc_id = ? AND user_id = ?
                      """, [doc_id, user_id]
                      )
        results = self.resultAsDictionary(cursor)
        for result in results:
            result['name'] = os.path.basename(result['location'])
        return results

    def change_selection(self, doc_id: int, velp_group_id: int, target_type: int, target_id: str, user_id: int, selected: bool):
        """Changes selection for velp group in VelpGroupSelection for specific user / document combo

        :param doc_id: ID of document
        :param velp_group_id: ID of velp group
        :param target_type: 0 document, 1 paragraph
        :param target_id: ID of targeted area
        :param user_id: ID of user
        :param selected: Boolean whether group is selected or not
        :return:
        """
        if selected is True:
            selected = 1
        else:
            selected = 0
        print("SELECTION", selected, doc_id, velp_group_id, user_id)
        cursor = self.db.cursor()
        cursor.execute("""
                      UPDATE VelpGroupSelection
                        SET selected = ?
                        WHERE user_id = ? AND doc_id = ? AND velp_group_id = ? AND target_type = ? AND target_id = ?
                        """, [selected, user_id, doc_id, velp_group_id, target_type, target_id]
                      )
        self.db.commit()

    def change_default_selection(self, doc_id: int, velp_group_id: int, target_type: int, target_id: str, selected: bool):
        """Changes selection for velp group's default selection in target area

        :param doc_id: ID of document
        :param target_type: 0 document, 1 paragraph
        :param target_id: ID of targeted area
        :param velp_group_id: ID of velp group
        :param selected: Boolean whether group is selected or not
        :return:
        """
        if selected is True:
            cursor = self.db.cursor()
            cursor.execute("""
                          INSERT OR IGNORE INTO
                          VelpGroupDefaults(doc_id, target_type, target_id, velp_group_id, selected)
                          VALUES (?, ?, ?, ?, ?)
                            """, [doc_id, target_type, target_id, velp_group_id, 1]
                          )
            self.db.commit()
        else:
            cursor = self.db.cursor()
            cursor.execute("""
                          DELETE
                          FROM VelpGroupDefaults
                            WHERE doc_id = ? AND velp_group_id = ? AND target_type = ? AND target_id = ?
                          """, [velp_group_id, velp_group_id, target_type, target_id]
                          )
            self.db.commit()

    def get_groups_from_defaults_table(self, doc_id: int):
        """Gets all velp group default selections for document

        :param doc_id: ID of document
        :return:
        """
        cursor = self.db.cursor()
        cursor.execute("""
                      SELECT
                      doc_id, target_type, target_id, velp_group_id as id, selected
                      FROM VelpGroupDefaults
                      WHERE doc_id = ? AND selected = 1
                      """, [doc_id]
                      )
        results = self.resultAsDictionary(cursor)
        return results

    def check_velp_group_ids_for_default_group(self, velp_group_ids: [int]):
        """Checks if list of velp group IDs contains a default velp group

        :param velp_group_ids: List of velp group IDs
        :return: First found default velp group ID and name
        """
        cursor = self.db.cursor()
        cursor.execute("""
                      SELECT
                      id, name
                      FROM VelpGroup
                      WHERE id IN ({}) AND default_group = 1
                      """.format(self.get_sql_template(velp_group_ids)), velp_group_ids
                      )
        results = self.resultAsDictionary(cursor)
        return results[0] if len(results) > 0 else None

    # Unused methods

    def update_velp_group(self, velp_group_id: int, name: str, valid_until: Optional[str]):
        """Updates name and/or valid until time of velp group

        :param velp_group_id: Velp group id
        :param name: Name of velp group
        :param valid_until: How long velp group is valid
        :return:
        """
        cursor = self.db.cursor()
        cursor.execute("""
                      UPDATE VelpGroup
                      SET name = ? AND  valid_until = ?
                      WHERE id = ?
                      """, [name, valid_until, velp_group_id]
                       )
        self.db.commit()

    def delete_velp_group(self, velp_group_id: int):
        """
        Deletes velp group

        Doesn't delete velps belonging to group, only their links to deleted group
        :param velp_group_id: Velp group id
        :return:
        """
        cursor = self.db.cursor()
        cursor.execute("""
                      DELETE
                      FROM VelpGroup
                      WHERE  id = ?;
                      DELETE
                      FROM VelpInGroup
                      WHERE velp_group_id = ?
                      """, [velp_group_id, velp_group_id]
                       )


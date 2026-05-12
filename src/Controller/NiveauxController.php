<?php

namespace App\Controller;

use App\Security\AppUser;
use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

class NiveauxController extends AbstractController
{
    public function __construct(private readonly Connection $db) {}

    // Lecture ouverte à tous les utilisateurs authentifiés (utile pour les menus déroulants)
    #[Route('/api/niveaux', name: 'api_niveaux_list', methods: ['GET'])]
    public function list(): JsonResponse
    {
        $rows = $this->db->fetchAllAssociative(
            'SELECT * FROM niveaux ORDER BY ordre'
        );

        return $this->json($rows);
    }

    /**
     * Réordonne tous les niveaux selon le tableau d'IDs fourni.
     * Le premier ID reçoit ordre=1, le second ordre=2, etc.
     */
    #[Route('/api/niveaux/reorder', name: 'api_niveaux_reorder', methods: ['POST'])]
    public function reorder(Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$user->isSysAdmin()) {
            return $this->json(['error' => 'Réservé aux administrateurs système'], 403);
        }

        $data = json_decode($request->getContent(), true) ?? [];
        $ids  = $data['ids'] ?? [];

        if (!is_array($ids) || empty($ids)) {
            return $this->json(['error' => 'ids est requis'], 400);
        }

        $ids = array_map('intval', $ids);

        // Utilise un offset temporaire élevé pour éviter les conflits d'unicité
        // si une contrainte UNIQUE existe sur (ordre).
        $this->db->beginTransaction();
        try {
            foreach ($ids as $index => $id) {
                $this->db->executeStatement(
                    'UPDATE niveaux SET ordre = :ordre WHERE id = :id',
                    ['ordre' => $index + 1, 'id' => $id]
                );
            }
            $this->db->commit();
        } catch (\Exception $e) {
            $this->db->rollBack();
            throw $e;
        }

        $rows = $this->db->fetchAllAssociative('SELECT * FROM niveaux ORDER BY ordre');

        return $this->json($rows);
    }

    /**
     * Crée un nouveau niveau.
     * Si insertBefore (ID d'un niveau existant) est fourni, décale tous les niveaux
     * dont l'ordre est >= à celui du niveau cible, puis insère à cette position.
     * Sinon, ajoute à la fin.
     */
    #[Route('/api/niveaux', name: 'api_niveaux_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$user->isSysAdmin()) {
            return $this->json(['error' => 'Réservé aux administrateurs système'], 403);
        }

        $data = json_decode($request->getContent(), true) ?? [];

        if (empty($data['nom']) || !is_string($data['nom'])) {
            return $this->json(['error' => 'Le nom est requis'], 400);
        }
        if (empty($data['slug']) || !preg_match('/^[a-z0-9_]+$/', (string) $data['slug'])) {
            return $this->json(['error' => 'Le slug est requis (lettres minuscules, chiffres, underscores uniquement)'], 400);
        }

        $insertBefore = isset($data['insertBefore']) ? (int) $data['insertBefore'] : null;

        $this->db->beginTransaction();
        try {
            if ($insertBefore !== null) {
                $targetOrdre = $this->db->fetchOne(
                    'SELECT ordre FROM niveaux WHERE id = :id',
                    ['id' => $insertBefore]
                );
                if ($targetOrdre === false) {
                    $this->db->rollBack();
                    return $this->json(['error' => 'Niveau de référence introuvable'], 404);
                }
                $ordre = (int) $targetOrdre;
                $this->db->executeStatement(
                    'UPDATE niveaux SET ordre = ordre + 1 WHERE ordre >= :ordre',
                    ['ordre' => $ordre]
                );
            } else {
                $maxOrdre = $this->db->fetchOne('SELECT COALESCE(MAX(ordre), 0) FROM niveaux');
                $ordre    = (int) $maxOrdre + 1;
            }

            $this->db->executeStatement(
                'INSERT INTO niveaux (nom, slug, ordre) VALUES (:nom, :slug, :ordre)',
                ['nom' => trim($data['nom']), 'slug' => trim($data['slug']), 'ordre' => $ordre]
            );
            $id = $this->db->lastInsertId();
            $this->db->commit();
        } catch (\Exception $e) {
            $this->db->rollBack();
            if (str_contains($e->getMessage(), 'unique') || str_contains($e->getMessage(), 'duplicate')) {
                return $this->json(['error' => 'Ce slug existe déjà'], 409);
            }
            throw $e;
        }

        $row = $this->db->fetchAssociative('SELECT * FROM niveaux WHERE id = :id', ['id' => $id]);

        return $this->json($row, 201);
    }

    #[Route('/api/niveaux/{id}', name: 'api_niveaux_update', methods: ['PATCH'])]
    public function update(int $id, Request $request): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$user->isSysAdmin()) {
            return $this->json(['error' => 'Réservé aux administrateurs système'], 403);
        }

        $data = json_decode($request->getContent(), true) ?? [];
        $sets = [];
        $vals = ['id' => $id];

        if (array_key_exists('nom', $data)) {
            if (!is_string($data['nom']) || trim($data['nom']) === '') {
                return $this->json(['error' => 'Le nom ne peut pas être vide'], 400);
            }
            $sets[]      = 'nom = :nom';
            $vals['nom'] = trim($data['nom']);
        }
        if (array_key_exists('slug', $data)) {
            if (!preg_match('/^[a-z0-9_]+$/', (string) $data['slug'])) {
                return $this->json(['error' => 'Le slug doit contenir uniquement des lettres minuscules, chiffres ou underscores'], 400);
            }
            $sets[]       = 'slug = :slug';
            $vals['slug'] = $data['slug'];
        }
        if (array_key_exists('ordre', $data)) {
            if (!is_int($data['ordre']) || $data['ordre'] < 1) {
                return $this->json(['error' => "L'ordre doit être un entier positif"], 400);
            }
            $sets[]        = 'ordre = :ordre';
            $vals['ordre'] = $data['ordre'];
        }

        if (empty($sets)) {
            return $this->json(['error' => 'Aucun champ à mettre à jour'], 400);
        }

        $count = $this->db->executeStatement(
            'UPDATE niveaux SET ' . implode(', ', $sets) . ' WHERE id = :id',
            $vals
        );

        if (!$count) {
            return $this->json(['error' => 'Niveau introuvable'], 404);
        }

        $row = $this->db->fetchAssociative('SELECT * FROM niveaux WHERE id = :id', ['id' => $id]);

        return $this->json($row);
    }

    #[Route('/api/niveaux/{id}', name: 'api_niveaux_delete', methods: ['DELETE'])]
    public function delete(int $id): JsonResponse
    {
        /** @var AppUser $user */
        $user = $this->getUser();
        if (!$user->isSysAdmin()) {
            return $this->json(['error' => 'Réservé aux administrateurs système'], 403);
        }

        $usage = (int) $this->db->fetchOne(
            'SELECT COUNT(*) FROM unites WHERE niveau_id = :id',
            ['id' => $id]
        );
        if ($usage > 0) {
            return $this->json(['error' => "Ce niveau est utilisé par $usage unité(s) et ne peut pas être supprimé"], 409);
        }

        $count = $this->db->executeStatement('DELETE FROM niveaux WHERE id = :id', ['id' => $id]);
        if (!$count) {
            return $this->json(['error' => 'Niveau introuvable'], 404);
        }

        return new JsonResponse(null, 204);
    }
}
